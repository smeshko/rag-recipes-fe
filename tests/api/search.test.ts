import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http } from "msw";
import { createElement, type ReactNode } from "react";
import { ApiError } from "../../src/api";
import { useSearch } from "../../src/api/search";
import {
  searchErrorHandler,
  searchFixture,
  searchInvalidHandler,
} from "../msw/handlers";
import { server } from "../msw/server";

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function searchSpy() {
  const spy = vi.fn();
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && request.url.includes("/api/v1/search")) {
      spy();
    }
  });
  return spy;
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe("useSearch", () => {
  it("posts {query, mode} as JSON and returns typed results", async () => {
    let capturedBody: unknown;
    let capturedType: string | null = null;
    server.use(
      http.post("/api/v1/search", async ({ request }) => {
        capturedType = request.headers.get("content-type");
        capturedBody = await request.json();
        return Response.json(searchFixture("frittata"));
      }),
    );
    const { result } = renderHook(() => useSearch("frittata", "hybrid"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedType).toContain("application/json");
    expect(capturedBody).toEqual({ query: "frittata", mode: "hybrid" });
    expect(result.current.data?.response.results).toHaveLength(2);
    expect(result.current.data?.response.results[0]?.item.title).toBe(
      "Spinach & Cheddar Frittata",
    );
    /* The producing mode travels with the results — see the placeholder case
       below for why the URL's mode is not a safe substitute. */
    expect(result.current.data?.mode).toBe("hybrid");
  });

  it("fires no request for an empty query", async () => {
    const spy = searchSpy();
    const { result } = renderHook(() => useSearch("", "hybrid"), {
      wrapper: wrapper(),
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("surfaces internal_error as a typed ApiError", async () => {
    server.use(searchErrorHandler());
    const { result } = renderHook(() => useSearch("frittata", "hybrid"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("internal_error");
    expect((err as ApiError).status).toBe(500);
  });

  it("surfaces invalid_request (bad mode) as a typed ApiError", async () => {
    server.use(searchInvalidHandler());
    const { result } = renderHook(() => useSearch("frittata", "hybrid"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as ApiError).code).toBe("invalid_request");
    expect((result.current.error as ApiError).status).toBe(400);
  });

  it("keeps the previous grid on a mode change but not on a new query", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrap = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    const { result, rerender } = renderHook(
      ({ q, mode }: { q: string; mode: "hybrid" | "keyword" | "vector" }) =>
        useSearch(q, mode),
      {
        initialProps: {
          q: "frittata",
          mode: "hybrid" as "hybrid" | "keyword" | "vector",
        },
        wrapper: wrap,
      },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ q: "frittata", mode: "keyword" });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.response.results).toHaveLength(2);
    /* The held-over data still reports the mode that produced it, not the
       newly-selected one — this is what stops the grid relabelling stale
       hybrid cards as keyword-ranked. */
    expect(result.current.data?.mode).toBe("hybrid");
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.mode).toBe("keyword");

    rerender({ q: "scones", mode: "keyword" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
