import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http } from "msw";
import type { ReactNode } from "react";
import { type AnswerAsk, ApiError } from "../../src/api";
import { isFallback, useAnswer } from "../../src/api/answers";
import {
  answersErrorHandler,
  answersHandler,
  fallbackNoResultsFixture,
  fallbackWithResultsFixture,
  groundedAnswerFixture,
} from "../msw/answers";
import { server } from "../msw/server";

/* One client per wrapper, reused across renderHook calls — the cache is what
   makes an answer outlive the component that asked for it, so a test that
   built a fresh client per mount could never observe that. */
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const BREAKFAST: AnswerAsk = {
  query: "breakfast",
  mode: "hybrid",
  reviewIncluded: false,
};

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
  it("fires only on run(), with the exact defaults-riding body", async () => {
    let capturedBody: unknown;
    let capturedType: string | null = null;
    server.use(
      http.post("/api/v1/answers", async ({ request }) => {
        capturedType = request.headers.get("content-type");
        capturedBody = await request.json();
        return Response.json(groundedAnswerFixture);
      }),
    );
    const { result } = renderHook(() => useAnswer(BREAKFAST), {
      wrapper: makeWrapper(),
    });
    /* An armed ask on its own must not fetch: the observer is disabled, so
       mounting one is free. Same awaited settle point as the positive case —
       a synchronous assertion after render() would pass vacuously. */
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(answersCalls).toBe(0);

    act(() => result.current.run(BREAKFAST));
    await waitFor(() => expect(result.current.data).toBeDefined());
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

  it("a remount reads the answer back — no second round-trip", async () => {
    /* The regression: opening a recipe unmounts the search page, and the
       answer has to survive that navigation without re-asking the LLM. */
    server.use(answersHandler(groundedAnswerFixture));
    const wrapper = makeWrapper();
    const first = renderHook(() => useAnswer(BREAKFAST), { wrapper });
    act(() => first.result.current.run(BREAKFAST));
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();

    const second = renderHook(() => useAnswer(BREAKFAST), { wrapper });
    /* Present on the very first render — not after a refetch settles. */
    expect(second.result.current.data?.answer.text).toBe(
      groundedAnswerFixture.answer.text,
    );
    expect(second.result.current.isFetching).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(answersCalls).toBe(1);
  });

  it("keys the answer to the whole ask — mode and corpus included", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const wrapper = makeWrapper();
    const asked = renderHook(() => useAnswer(BREAKFAST), { wrapper });
    act(() => asked.result.current.run(BREAKFAST));
    await waitFor(() => expect(asked.result.current.data).toBeDefined());

    /* Same query, other mode / other corpus / other query: three different
       questions, none of which may serve this answer. */
    for (const other of [
      { ...BREAKFAST, mode: "vector" as const },
      { ...BREAKFAST, reviewIncluded: true },
      { ...BREAKFAST, query: "scones" },
    ]) {
      const { result } = renderHook(() => useAnswer(other), { wrapper });
      expect(result.current.data).toBeUndefined();
    }
    /* And nothing was asked, so nothing was spent. */
    expect(answersCalls).toBe(1);
  });

  it("reads nothing, and never fetches, without an ask", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const { result } = renderHook(() => useAnswer(null), {
      wrapper: makeWrapper(),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
    expect(answersCalls).toBe(0);
  });

  it("discriminates fallback on warnings only", () => {
    expect(isFallback(groundedAnswerFixture)).toBe(false);
    expect(isFallback(fallbackWithResultsFixture)).toBe(true);
    expect(isFallback(fallbackNoResultsFixture)).toBe(true);
  });

  it("surfaces error envelopes as ApiError with exactly one attempt", async () => {
    server.use(answersErrorHandler("internal_error"));
    const { result } = renderHook(() => useAnswer(BREAKFAST), {
      wrapper: makeWrapper(),
    });
    act(() => result.current.run(BREAKFAST));
    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("internal_error");
    /* retry: false — the failed attempt is the only attempt. */
    expect(answersCalls).toBe(1);
  });

  it("maps invalid_request with its details", async () => {
    server.use(answersErrorHandler("invalid_request"));
    const ask: AnswerAsk = { query: "", mode: "hybrid", reviewIncluded: false };
    const { result } = renderHook(() => useAnswer(ask), {
      wrapper: makeWrapper(),
    });
    act(() => result.current.run(ask));
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
