import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { createElement, type ReactNode } from "react";
import { useDocuments, useShelfStats } from "../../src/api/documents";
import { documentNotFoundEnvelope, fixtureReadyRecipes } from "../msw/handlers";
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
  it("counts cookbooks and sums ready recipes across the shelf", async () => {
    const { result } = renderHook(() => useShelfStats(), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.cookbookCount).toBe(3));
    await waitFor(() =>
      expect(result.current.readyRecipes).toBe(fixtureReadyRecipes),
    );
  });

  it("resolves a flagged floor rather than a false total when a book fails", async () => {
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
    await waitFor(() => expect(result.current.cookbookCount).toBe(3));
    /* 107 + 105 from the two healthy books; the 404 must not hang the sum
       (TASK-001), but 212 is a floor, not the shelf's total — `partial` is
       what stops the hero stating it as exact. */
    await waitFor(() => expect(result.current.readyRecipes).toBe(212));
    expect(result.current.partial).toBe(true);
  });

  it("does not flag a complete shelf as partial", async () => {
    const { result } = renderHook(() => useShelfStats(), {
      wrapper: wrapper(),
    });
    await waitFor(() =>
      expect(result.current.readyRecipes).toBe(fixtureReadyRecipes),
    );
    expect(result.current.partial).toBe(false);
  });

  it("reports zero — not unknown — for an empty shelf", async () => {
    server.use(
      http.get("/api/v1/documents", () => HttpResponse.json({ documents: [] })),
    );
    const { result } = renderHook(() => useShelfStats(), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.cookbookCount).toBe(0));
    await waitFor(() => expect(result.current.readyRecipes).toBe(0));
  });
});
