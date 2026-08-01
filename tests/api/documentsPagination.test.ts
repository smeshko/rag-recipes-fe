import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { createElement, type ReactNode } from "react";
import { ApiError } from "../../src/api";
import {
  fetchAllDocuments,
  PaginationCapError,
  useDocumentDetails,
  useDocuments,
} from "../../src/api/documents";
import type { DocumentListItem } from "../../src/api/types";
import {
  documentDetailHandler,
  documentsListHandler,
  libraryBooks,
} from "../msw/handlers";
import { server } from "../msw/server";

const makeBooks = (n: number): DocumentListItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `doc-${String(i).padStart(4, "0")}`,
    category: "recipes",
    subcategory: null,
    title: `Book ${i}`,
    author: "Author",
    source_type: "pdf",
    status: "ready",
    active_source_version: 1,
  }));

/* Per the phase-1.2 contract: hook tests build their own client with
   retry: false to avoid backoff flakes. */
const createWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
};

describe("fetchAllDocuments pagination loop", () => {
  it("fetches 205 rows across 2 requests with limit=200 and stepped offsets", async () => {
    const books = makeBooks(205);
    const urls: URL[] = [];
    server.use(documentsListHandler(books, (url) => urls.push(url)));

    const result = (await fetchAllDocuments()).documents;

    expect(result).toHaveLength(205);
    expect(result.map((d) => d.id)).toEqual(books.map((d) => d.id));
    expect(urls).toHaveLength(2);
    expect(urls[0].searchParams.get("limit")).toBe("200");
    expect(urls[0].searchParams.get("offset")).toBe("0");
    expect(urls[1].searchParams.get("limit")).toBe("200");
    expect(urls[1].searchParams.get("offset")).toBe("200");
  });

  it("terminates on an exact multiple of the page size (200 rows, 2 requests)", async () => {
    const books = makeBooks(200);
    const urls: URL[] = [];
    server.use(documentsListHandler(books, (url) => urls.push(url)));

    const result = (await fetchAllDocuments()).documents;

    expect(result).toHaveLength(200);
    expect(urls).toHaveLength(2);
    expect(urls[1].searchParams.get("offset")).toBe("200");
  });

  it("de-duplicates a boundary row repeated across pages", async () => {
    /* Simulates an upload landing mid-loop: the page-boundary row shifts
       down and comes back at the top of page 2. */
    const books = makeBooks(205);
    server.use(
      http.get("/api/v1/documents", ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get("offset") ?? "0");
        const limit = Number(url.searchParams.get("limit") ?? "50");
        const page =
          offset === 0
            ? books.slice(0, limit)
            : [books[offset - 1], ...books.slice(offset, offset + limit - 1)];
        return HttpResponse.json({ documents: page });
      }),
    );

    const result = (await fetchAllDocuments()).documents;

    const ids = result.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns a shelf of exactly the cap (5000 rows, 26 requests)", async () => {
    /* The boundary the cap is written for: 25 full pages fill the budget, so
       the terminating short page at offset 5000 has to still be allowed to
       run — otherwise a legitimately-full shelf reads as unavailable. */
    const books = makeBooks(5000);
    const urls: URL[] = [];
    server.use(documentsListHandler(books, (url) => urls.push(url)));

    const result = (await fetchAllDocuments()).documents;

    expect(result).toHaveLength(5000);
    expect(urls).toHaveLength(26);
    expect(urls[25].searchParams.get("offset")).toBe("5000");
  });

  it("returns an over-cap shelf in full rather than failing it", async () => {
    /* Characterisation, not an accident: the guard bounds REQUESTS, not
       documents, so a shelf just past 25 full pages still terminates on its
       short page and is returned whole. Throwing here would misreport a
       working list as unavailable — the failure mode the isSuccess gate in
       LibraryPage exists to prevent. */
    const books = makeBooks(5100);
    const urls: URL[] = [];
    server.use(documentsListHandler(books, (url) => urls.push(url)));

    const result = (await fetchAllDocuments()).documents;

    expect(result).toHaveLength(5100);
    expect(urls).toHaveLength(26);
  });

  it("trips the iteration cap on a server that ignores offset", async () => {
    const page = makeBooks(200);
    server.use(
      http.get("/api/v1/documents", () =>
        HttpResponse.json({ documents: page }),
      ),
    );

    await expect(fetchAllDocuments()).rejects.toBeInstanceOf(
      PaginationCapError,
    );
  });
});

describe("useDocuments", () => {
  it("resolves the full de-paginated list under the ['documents'] key", async () => {
    server.use(documentsListHandler(makeBooks(3)));

    const { result } = renderHook(() => useDocuments(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.documents).toHaveLength(3);
  });
});

describe("useDocumentDetails", () => {
  it("resolves {document, counts} per id", async () => {
    const fixture = libraryBooks[1];
    server.use(documentDetailHandler(fixture.list.id, fixture.detail));

    const { result } = renderHook(() => useDocumentDetails([fixture.list.id]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current[0].isSuccess).toBe(true));
    expect(result.current[0].data?.document.title).toBe(
      "One Pan to Rule Them All",
    );
    expect(result.current[0].data?.counts.ready_items).toBe(107);
  });

  it("surfaces ApiError document_not_found for an unknown id", async () => {
    /* No per-id override: the base catch-all 404s. */
    const { result } = renderHook(() => useDocumentDetails(["no-such-book"]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current[0].isError).toBe(true));
    const error = result.current[0].error;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("document_not_found");
    expect((error as ApiError).status).toBe(404);
  });
});
