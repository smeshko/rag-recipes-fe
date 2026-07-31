import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http } from "msw";
import type { ReactNode } from "react";
import { ApiError } from "../../src/api";
import { isFallback, useAnswer } from "../../src/api/answers";
import {
  answersErrorHandler,
  fallbackNoResultsFixture,
  fallbackWithResultsFixture,
  groundedAnswerFixture,
} from "../msw/answers";
import { server } from "../msw/server";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

let answersCalls = 0;

beforeEach(() => {
  answersCalls = 0;
  server.events.on("request:start", ({ request }) => {
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/api/v1/answers"
    ) {
      answersCalls += 1;
    }
  });
});

afterEach(() => {
  server.events.removeAllListeners();
});

describe("useAnswer", () => {
  it("fires only on .mutate(), with the exact defaults-riding body", async () => {
    let capturedBody: unknown;
    let capturedType: string | null = null;
    server.use(
      http.post("/api/v1/answers", async ({ request }) => {
        capturedType = request.headers.get("content-type");
        capturedBody = await request.json();
        return Response.json(groundedAnswerFixture);
      }),
    );
    const { result } = renderHook(() => useAnswer(), {
      wrapper: makeWrapper(),
    });
    /* Same awaited settle point as the positive case — a synchronous
       assertion after render() would pass vacuously. */
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(answersCalls).toBe(0);

    result.current.mutate({ query: "breakfast", mode: "hybrid" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(answersCalls).toBe(1);
    expect(capturedType).toBe("application/json");
    expect(capturedBody).toEqual({
      query: "breakfast",
      retrieval: { mode: "hybrid" },
      answer: { include_results: false },
    });
    expect(result.current.data?.answer.citations).toEqual([
      "cite_1",
      "cite_4",
      "cite_8",
    ]);
  });

  it("discriminates fallback on warnings only", () => {
    expect(isFallback(groundedAnswerFixture)).toBe(false);
    expect(isFallback(fallbackWithResultsFixture)).toBe(true);
    expect(isFallback(fallbackNoResultsFixture)).toBe(true);
  });

  it("surfaces error envelopes as ApiError with exactly one attempt", async () => {
    server.use(answersErrorHandler("internal_error"));
    const { result } = renderHook(() => useAnswer(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({ query: "breakfast", mode: "hybrid" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("internal_error");
    /* retry: false — the failed attempt is the only attempt. */
    expect(answersCalls).toBe(1);
  });

  it("maps invalid_request with its details", async () => {
    server.use(answersErrorHandler("invalid_request"));
    const { result } = renderHook(() => useAnswer(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({ query: "", mode: "hybrid" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as ApiError).details).toEqual({
      field: "query",
    });
  });

  it("fallback fixture keeps text === warnings[0] and results populated", () => {
    expect(fallbackWithResultsFixture.answer.text).toBe(
      fallbackWithResultsFixture.warnings[0],
    );
    expect(fallbackWithResultsFixture.results.length).toBeGreaterThan(0);
    expect(fallbackWithResultsFixture.citations).toEqual([]);
    expect(fallbackWithResultsFixture.recommendations).toEqual([]);
  });
});
