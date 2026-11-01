import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { createElement, type ReactNode } from "react";
import { useDocuments, useShelfStats } from "../../src/api/documents";
import {
  documentDetailFixture,
  documentNotFoundEnvelope,
  documentsFixture,
  fixtureRecipeCount,
  libraryBooks,
} from "../msw/handlers";
import { server } from "../msw/server";

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useDocuments", () => {
  it("walks every page instead of stopping at the backend's page cap", async () => {
    /* 260 books: more than one 200-row page, and far more than the backend's
       50-row default — the case where a single unpaged call would report a
       short shelf as if it were the whole one. */
    const shelf = Array.from({ length: 260 }, (_, i) => ({
      id: `doc_${i}`,
      category: "recipes",
      subcategory: null,
      title: `book ${i}`,
      author: "",
      source_type: "pdf",
      status: "ready",
      active_source_version: 1,
      knowledge_items: 0,
    }));
    const requestedOffsets: string[] = [];
    server.use(
      http.get("/api/v1/documents", ({ request }) => {
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get("limit"));
        const offset = Number(url.searchParams.get("offset"));
        requestedOffsets.push(`${offset}:${limit}`);
        return HttpResponse.json({
          documents: shelf.slice(offset, offset + limit),
        });
      }),
    );

    const { result } = renderHook(() => useDocuments(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.documents).toHaveLength(260);
    /* Second page is short (60 < 200), so the walk stops there. */
    expect(requestedOffsets).toEqual(["0:200", "200:200"]);
  });

  it("de-duplicates rows repeated across pages", async () => {
    /* A concurrent insert shifts offsets and can serve the same row twice;
       the shelf count must not double-count it. */
    const page = (ids: string[]) => ({
      documents: ids.map((id) => ({
        id,
        category: "recipes",
        subcategory: null,
        title: id,
        author: "",
        source_type: "pdf",
        status: "ready",
        active_source_version: 1,
        knowledge_items: 0,
      })),
    });
    const pages = [
      page(Array.from({ length: 200 }, (_, i) => `doc_${i}`)),
      page(["doc_199", "doc_200"]),
    ];
    server.use(
      http.get("/api/v1/documents", ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get("offset"));
        return HttpResponse.json(pages[offset === 0 ? 0 : 1]);
      }),
    );

    const { result } = renderHook(() => useDocuments(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.documents).toHaveLength(201);
  });
});

describe("useShelfStats", () => {
  it("sums each book's knowledge_items off the list", async () => {
    const { result } = renderHook(() => useShelfStats(), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.cookbookCount).toBe(3));
    await waitFor(() =>
      expect(result.current.recipeCount).toBe(fixtureRecipeCount),
    );
    expect(result.current.unavailable).toBe(false);
  });

  it("fetches no per-book detail to build the total", async () => {
    let detailRequests = 0;
    server.use(
      http.get("/api/v1/documents/:documentId", () => {
        detailRequests += 1;
        return HttpResponse.json(documentNotFoundEnvelope("unexpected"), {
          status: 404,
        });
      }),
    );
    const { result } = renderHook(() => useShelfStats(), {
      wrapper: wrapper(),
    });
    await waitFor(() =>
      expect(result.current.recipeCount).toBe(fixtureRecipeCount),
    );
    expect(detailRequests).toBe(0);
  });

  it("is not moved by a failing detail, because it never reads one", async () => {
    server.use(
      http.get("/api/v1/documents/doc_baking", () =>
        HttpResponse.json(documentNotFoundEnvelope("doc_baking"), {
          status: 404,
        }),
      ),
    );
    const { result } = renderHook(() => useShelfStats(), {
      wrapper: wrapper(),
    });
    await waitFor(() =>
      expect(result.current.recipeCount).toBe(fixtureRecipeCount),
    );
    expect(result.current.unavailable).toBe(false);
  });

  it("is undefined until the list resolves, then the list's sum", async () => {
    server.use(
      http.get("/api/v1/documents", async () => {
        await delay(20);
        return HttpResponse.json(documentsFixture);
      }),
    );
    const { result } = renderHook(() => useShelfStats(), {
      wrapper: wrapper(),
    });
    expect(result.current.recipeCount).toBeUndefined();
    await waitFor(() =>
      expect(result.current.recipeCount).toBe(fixtureRecipeCount),
    );
  });

  it("reports unavailable, with no total, when the list itself fails", async () => {
    server.use(
      http.get("/api/v1/documents", () =>
        HttpResponse.json(
          { error: { code: "unauthorized", message: "nope", details: {} } },
          { status: 401 },
        ),
      ),
    );
    const { result } = renderHook(() => useShelfStats(), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.recipeCount).toBeUndefined();
    expect(result.current.cookbookCount).toBeUndefined();
  });

  it("reports zero — not unknown — for an empty shelf", async () => {
    server.use(
      http.get("/api/v1/documents", () => HttpResponse.json({ documents: [] })),
    );
    const { result } = renderHook(() => useShelfStats(), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.cookbookCount).toBe(0));
    await waitFor(() => expect(result.current.recipeCount).toBe(0));
  });
});

describe("list knowledge_items vs detail counts", () => {
  it("agrees with each book's detail counts.knowledge_items in the fixtures", () => {
    for (const doc of documentsFixture.documents) {
      const detail = documentDetailFixture(doc.id);
      expect(detail?.counts.knowledge_items).toBe(doc.knowledge_items);
    }
    for (const book of libraryBooks) {
      expect(book.list.knowledge_items).toBe(
        book.detail.counts.knowledge_items,
      );
    }
  });
});
