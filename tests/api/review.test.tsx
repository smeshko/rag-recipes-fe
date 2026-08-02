import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ApiError } from "../../src/api";
import {
  fetchAllReviewItems,
  useReviewDecision,
  useReviewItems,
} from "../../src/api/review";
import type { ReviewItem } from "../../src/api/types";
import {
  reviewDecisionHandler,
  reviewItemsFixture,
  reviewItemsHandler,
  reviewScenario,
} from "../../src/mocks/review";
import { server } from "../msw/server";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** Synthetic bulk queue for the page-walk proof — never real dev-DB ids. */
const makeItems = (n: number): ReviewItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `ki_bulk_${String(i).padStart(4, "0")}`,
    title: `Recipe ${i}`,
    summary: null,
    item_type: "recipe",
    document: { id: "doc_bulk", title: "bulkbook" },
    source_pages: { page_start: i + 1, page_end: i + 1 },
    extraction: {
      schema: "recipe.v1",
      yield: null,
      top_ingredients: [],
      confidence_overall: 0.5,
    },
    flags: [
      {
        code: "low_overall_confidence",
        message: "Overall extraction confidence is below the review threshold.",
      },
    ],
  }));

describe("useReviewItems", () => {
  it("resolves every fixture item through the base handlers", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReviewItems(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const items: ReviewItem[] = result.current.data?.review_items ?? [];
    expect(items.map((i) => i.id)).toEqual(reviewItemsFixture.map((i) => i.id));
    /* Spot-check the typed shape end-to-end. */
    expect(items[0]?.document.title).toBe("bakingwithlesssugar");
    expect(items[0]?.flags[0]?.code).toBe("low_normalization_confidence");
  });

  it("walks >200 items across pages: stepped offsets, short page ends it", async () => {
    const items = makeItems(205);
    const urls: URL[] = [];
    server.use(reviewItemsHandler(items, (url) => urls.push(url)));

    const result = (await fetchAllReviewItems()).review_items;

    expect(result).toHaveLength(205);
    expect(result.map((i) => i.id)).toEqual(items.map((i) => i.id));
    expect(urls).toHaveLength(2);
    expect(urls[0].searchParams.get("limit")).toBe("200");
    expect(urls[0].searchParams.get("offset")).toBe("0");
    expect(urls[0].searchParams.get("document_id")).toBeNull();
    expect(urls[1].searchParams.get("limit")).toBe("200");
    expect(urls[1].searchParams.get("offset")).toBe("200");
  });

  it("filters to one book and carries document_id on the wire", async () => {
    const urls: URL[] = [];
    server.use(reviewItemsHandler(reviewItemsFixture, (url) => urls.push(url)));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReviewItems("doc_baking"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const items = result.current.data?.review_items ?? [];
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.every((i) => i.document.id === "doc_baking")).toBe(true);
    expect(urls[0].searchParams.get("document_id")).toBe("doc_baking");
  });

  it("resolves [] (success, not error) for an unknown document_id", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReviewItems("doc_nowhere"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.review_items).toEqual([]);
  });

  it("resolves [] from an empty reviewScenario", async () => {
    server.use(...reviewScenario([]));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReviewItems(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.review_items).toEqual([]);
  });
});

describe("useReviewDecision", () => {
  it("approve resolves as decided and invalidates exactly the promised keys", async () => {
    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(["documents"], { documents: [] });
    queryClient.setQueryData(["document", "doc_baking"], { seeded: true });
    queryClient.setQueryData(["review-items", null], { review_items: [] });
    queryClient.setQueryData(["document", "doc_baking", "status"], {
      terminal: true,
    });

    const { result } = renderHook(() => useReviewDecision("ki_maple_cutouts"), {
      wrapper,
    });
    const response = await result.current.mutateAsync("approved");

    expect(response.decision).toBe("approved");
    /* Async approve: the label ("indexing" in fixtures) is the backend's
       choice — the contract is only "non-needs_review means decided". */
    expect(response.knowledge_item.status).not.toBe("needs_review");
    expect(response.knowledge_item.document_id).toBe("doc_baking");

    expect(queryClient.getQueryState(["documents"])?.isInvalidated).toBe(true);
    expect(
      queryClient.getQueryState(["document", "doc_baking"])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["review-items", null])?.isInvalidated,
    ).toBe(true);
    /* Exact document invalidation: the status poll must never be refired. */
    expect(
      queryClient.getQueryState(["document", "doc_baking", "status"])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("reject resolves 'rejected' and the item leaves a scenario's list", async () => {
    server.use(...reviewScenario(reviewItemsFixture));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useReviewDecision("ki_honey_oat_loaf"),
      {
        wrapper,
      },
    );

    const response = await result.current.mutateAsync("rejected");
    expect(response.decision).toBe("rejected");
    expect(response.knowledge_item.status).toBe("rejected");

    const list = (await fetchAllReviewItems()).review_items;
    expect(list.map((i) => i.id)).not.toContain("ki_honey_oat_loaf");
    expect(list).toHaveLength(reviewItemsFixture.length - 1);
  });

  it("a scenario's GET still honors the document_id filter minus decided items", async () => {
    server.use(...reviewScenario(reviewItemsFixture));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReviewDecision("ki_maple_cutouts"), {
      wrapper,
    });
    await result.current.mutateAsync("approved");

    const filtered = (await fetchAllReviewItems("doc_baking")).review_items;
    expect(filtered.every((i) => i.document.id === "doc_baking")).toBe(true);
    expect(filtered.map((i) => i.id)).not.toContain("ki_maple_cutouts");
    expect(filtered.length).toBeGreaterThanOrEqual(2);
  });

  it("runs caller callbacks in order: onMutate → request → onSettled → invalidations", async () => {
    const log: string[] = [];
    server.use(
      reviewDecisionHandler(reviewItemsFixture, () => log.push("request")),
    );

    const { queryClient, wrapper } = makeWrapper();
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters) => {
      log.push("invalidate");
      return originalInvalidate(filters);
    });

    const { result } = renderHook(
      () =>
        useReviewDecision("ki_maple_cutouts", {
          onMutate: () => {
            log.push("onMutate");
          },
          onSettled: () => {
            log.push("onSettled");
          },
        }),
      { wrapper },
    );
    await result.current.mutateAsync("approved");

    expect(log).toEqual([
      "onMutate",
      "request",
      "onSettled",
      "invalidate",
      "invalidate",
      "invalidate",
    ]);
  });

  it("fires caller onError on a 404 and still invalidates the settled keys", async () => {
    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(["review-items", null], { review_items: [] });
    queryClient.setQueryData(["documents"], { documents: [] });

    const onError = vi.fn();
    const { result } = renderHook(
      () => useReviewDecision("ki_missing", { onError }),
      { wrapper },
    );

    await expect(result.current.mutateAsync("approved")).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(ApiError);

    /* A 404 means the card was stale — refreshing the queue is the fix. */
    expect(
      queryClient.getQueryState(["review-items", null])?.isInvalidated,
    ).toBe(true);
    expect(queryClient.getQueryState(["documents"])?.isInvalidated).toBe(true);
  });

  it("rejects with knowledge_item_not_found for an unknown id", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReviewDecision("ki_missing"), {
      wrapper,
    });
    const err: unknown = await result.current
      .mutateAsync("approved")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("knowledge_item_not_found");
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).details).toEqual({
      item_id: "ki_missing",
    });
  });

  it("rejects a second decision with review_not_pending under one scenario", async () => {
    server.use(...reviewScenario(reviewItemsFixture));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReviewDecision("ki_pear_galette"), {
      wrapper,
    });

    await result.current.mutateAsync("approved");
    const err: unknown = await result.current
      .mutateAsync("approved")
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("review_not_pending");
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).details).toEqual({
      item_id: "ki_pear_galette",
      status: "indexing",
    });
  });

  /* The next two tests are a PAIR: same fixture id decided through the BASE
     handlers in consecutive tests. Both must answer 200 — the base pair is
     stateless, so no decision leaks across tests. */
  it("decides ki_maple_cutouts through the base handlers (first run)", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReviewDecision("ki_maple_cutouts"), {
      wrapper,
    });
    const response = await result.current.mutateAsync("approved");
    expect(response.decision).toBe("approved");
  });

  it("decides ki_maple_cutouts through the base handlers again (no cross-test leak)", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReviewDecision("ki_maple_cutouts"), {
      wrapper,
    });
    const response = await result.current.mutateAsync("approved");
    expect(response.decision).toBe("approved");
  });
});
