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

  it("withholds the total rather than undercounting when a book fails", async () => {
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
    /* The two healthy books sum to 212, but the shelf holds three: publishing
       212 would state a short total as if it were exact. The cookbook count
       still renders, so the hero degrades rather than breaking. */
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(result.current.readyRecipes).toBeUndefined();
    expect(result.current.cookbookCount).toBe(3);
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
