import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { request } from "./client";
import { PaginationCapError } from "./documents";
import { route } from "./routes";
import type {
  ReviewDecision,
  ReviewDecisionRequest,
  ReviewDecisionResponse,
  ReviewItem,
  ReviewListResponse,
} from "./types";

/* Review-queue hooks (phase 4.2). Served by MSW mocks (src/mocks/review.ts)
   until phase 4.4 wires the live backend — the call sites never change,
   because `route()` already types the two paths via review-schema.d.ts. */

/* Same page-walk contract as the shelf (DECISIONS.md D6): the response
   carries no total, so walk `limit`/`offset` pages until one comes back
   short. Same constants as documents.ts — see the cap commentary there;
   the bound is on REQUESTS, not items. */
const LIST_PAGE_SIZE = 200;
const LIST_MAX_PAGES = 25;

/** Walk every review page, deduped by id (offsets shift under concurrent
    decisions exactly as they do under concurrent uploads). */
export async function fetchAllReviewItems(
  documentId?: string,
): Promise<ReviewListResponse> {
  const items: ReviewItem[] = [];
  const seen = new Set<string>();

  for (let page = 0; page <= LIST_MAX_PAGES; page += 1) {
    const batch = await request<ReviewListResponse>(
      route("/review-items", "get", {
        query: {
          /* undefined → serializeQuery drops the param entirely. */
          document_id: documentId,
          limit: String(LIST_PAGE_SIZE),
          offset: String(page * LIST_PAGE_SIZE),
        },
      }),
    );
    for (const item of batch.review_items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
    if (batch.review_items.length < LIST_PAGE_SIZE) {
      return { review_items: items };
    }
  }

  throw new PaginationCapError(LIST_MAX_PAGES + 1);
}

/** The single source of the ['review-items', …] cache entries. `undefined`
    maps to key segment `null` so the unfiltered list has a stable key;
    the decision mutation invalidates the bare ['review-items'] prefix to
    catch every filter variant at once. */
export function reviewItemsQueryOptions(documentId?: string) {
  return queryOptions({
    queryKey: ["review-items", documentId ?? null],
    queryFn: () => fetchAllReviewItems(documentId),
  });
}

export function useReviewItems(documentId?: string) {
  return useQuery(reviewItemsQueryOptions(documentId));
}

/** The 4.3 seam (DECISIONS.md D8): TanStack v5 accepts onSuccess/onError/
    onSettled per `mutate()` call but NOT `onMutate`, so hook-level
    pass-through is the only way 4.3 gets its optimistic snapshot/rollback
    without editing this file. 4.3 passes `onMutate` (snapshot + optimistic
    card removal), `onError` (rollback + inline error) and `onSettled` (its
    own cleanup); it never re-implements the mutationFn or invalidations. */
export interface UseReviewDecisionOptions<TContext = unknown> {
  /* Return type mirrors useMutation's own onMutate: TContext or a promise
     of it — v5 types the context as always produced when onMutate is set. */
  onMutate?: (decision: ReviewDecision) => Promise<TContext> | TContext;
  onError?: (
    error: Error,
    decision: ReviewDecision,
    context: TContext | undefined,
  ) => Promise<unknown> | unknown;
  onSettled?: (
    data: ReviewDecisionResponse | undefined,
    error: Error | null,
    decision: ReviewDecision,
    context: TContext | undefined,
  ) => Promise<unknown> | unknown;
}

/**
 * POST /knowledge-items/{item_id}/review. Success semantics: approve is
 * async (202-style) and the response `status` is treated only as
 * "non-`needs_review` ⇒ decided" — no logic keys on the backend's choice of
 * transitional label.
 *
 * The hook's OWN invalidations run in its composed `onSettled`, always AFTER
 * the caller's callback, on success AND on error (a 404 means the card was
 * stale; refreshing the queue is the fix): the ['review-items'] prefix
 * (every filter variant) and ['documents'] (shelf list/pills)
 * unconditionally, plus the EXACT ['document', document_id] on success only
 * (no response → no document id; exact so ['document', id, 'status'] polling
 * is never refired — `invalidateOnTerminal`'s documented trap in
 * documents.ts).
 */
export function useReviewDecision<TContext = unknown>(
  itemId: string,
  options: UseReviewDecisionOptions<TContext> = {},
) {
  const queryClient = useQueryClient();

  return useMutation<ReviewDecisionResponse, Error, ReviewDecision, TContext>({
    mutationFn: (decision) => {
      const body: ReviewDecisionRequest = { decision };
      return request<ReviewDecisionResponse>(
        route("/knowledge-items/{item_id}/review", "post", {
          params: { item_id: itemId },
        }),
        {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        },
      );
    },
    onMutate: options.onMutate,
    onError: options.onError,
    onSettled: async (data, error, decision, context) => {
      try {
        await options.onSettled?.(data, error, decision, context);
      } finally {
        void queryClient.invalidateQueries({ queryKey: ["review-items"] });
        void queryClient.invalidateQueries({ queryKey: ["documents"] });
        if (data) {
          void queryClient.invalidateQueries({
            queryKey: ["document", data.knowledge_item.document_id],
            exact: true,
          });
        }
      }
    },
  });
}
