import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { createElement, type ReactNode } from "react";
import { useShelfStats } from "../../src/api/documents";
import { documentNotFoundEnvelope, fixtureReadyRecipes } from "../msw/handlers";
import { server } from "../msw/server";

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

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
