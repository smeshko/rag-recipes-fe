import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./client";
import { route } from "./routes";
import type {
  KnowledgeItemResponse,
  KnowledgeItemUpdateRequest,
} from "./types";

/* id is optional because useParams().id is string | undefined — the enabled
   guard replaces any non-null assertion at the call site. */
export function useKnowledgeItem(id: string | undefined) {
  return useQuery({
    queryKey: ["knowledge-item", id],
    enabled: Boolean(id),
    queryFn: () =>
      request<KnowledgeItemResponse>(
        route("/knowledge-items/{item_id}", "get", {
          params: { item_id: id as string },
        }),
      ),
  });
}

/** The 5.4 seam, the same shape `useReviewDecision` exposes and for the same
    reason: TanStack v5 accepts onSuccess/onError/onSettled per `mutate()` call
    but NOT `onMutate`, so hook-level pass-through is the only way a consumer
    gets an optimistic hook without editing this module. 5.4 passes its Save /
    Save-and-approve choreography here; it never re-implements the mutationFn,
    the cache write or the invalidation. */
export interface UseUpdateKnowledgeItemOptions<TContext = unknown> {
  /* Return type mirrors useMutation's own onMutate: TContext or a promise
     of it — v5 types the context as always produced when onMutate is set. */
  onMutate?: (body: KnowledgeItemUpdateRequest) => Promise<TContext> | TContext;
  onError?: (
    error: Error,
    body: KnowledgeItemUpdateRequest,
    context: TContext | undefined,
  ) => Promise<unknown> | unknown;
  onSettled?: (
    data: KnowledgeItemResponse | undefined,
    error: Error | null,
    body: KnowledgeItemUpdateRequest,
    context: TContext | undefined,
  ) => Promise<unknown> | unknown;
}

/**
 * PATCH /knowledge-items/{item_id} — an in-place edit of a `needs_review`
 * item. The response is the GET body field-for-field, with `review_reasons`
 * recomputed and `edited_at` stamped (docs/edit-api-contract.md).
 *
 * `itemId` is a plain `string`, unlike `useKnowledgeItem` above: a mutation
 * has no `enabled` guard to hang an optional id on, so the caller narrows
 * `useParams().id` once (it must anyway, to render a not-found state).
 *
 * THREE deliberate divergences from `useReviewDecision`, whose structure this
 * otherwise copies:
 *
 * 1. The item entry is WRITTEN, not invalidated (PLAN D5). The PATCH response
 *    IS the GET body, so invalidating would mark the fresh entry stale and
 *    cost a refetch on the way back to read mode.
 * 2. NO ['documents'] / ['document', id] invalidations (PLAN D6). An edit
 *    leaves the item `needs_review`, so no shelf count moves; only the queue
 *    changes, hence ['review-items'] (bare prefix, every filter variant) on
 *    settle — success and failure alike, because a 404 means the card was
 *    stale and refreshing the queue is the fix.
 * 3. The write happens BEFORE the caller's `onSettled`, the invalidation
 *    after it (PLAN D12). `useReviewDecision` does all of its own work in the
 *    `finally`; copying that literally would show every caller-supplied
 *    `onSettled` a PRE-patch item — and that callback is exactly where 5.4
 *    returns to read mode with the server's recomputed flags. Do not "tidy"
 *    the setQueryData into the `finally`.
 */
export function useUpdateKnowledgeItem<TContext = unknown>(
  itemId: string,
  options: UseUpdateKnowledgeItemOptions<TContext> = {},
) {
  const queryClient = useQueryClient();

  return useMutation<
    KnowledgeItemResponse,
    Error,
    KnowledgeItemUpdateRequest,
    TContext
  >({
    /* Saves of the SAME item run one at a time (TanStack v5 mutation scope);
       different items still run in parallel. Not a nicety: this hook WRITES
       ['knowledge-item', id] and deliberately never invalidates it (D5), so a
       slow earlier response landing after a newer one would leave the cache
       holding pre-patch content with nothing to correct it. Serializing here
       rather than at the call site keeps the guarantee with the write. */
    scope: { id: `knowledge-item-${itemId}` },
    /* The annotation on `body` comes from the generic above and is the ONLY
       type safety on the patch payload: route() checks path and method, never
       the request body (PLAN D1). The client never serializes for you. */
    mutationFn: (body) =>
      request<KnowledgeItemResponse>(
        route("/knowledge-items/{item_id}", "patch", {
          params: { item_id: itemId },
        }),
        {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        },
      ),
    onMutate: options.onMutate,
    onError: options.onError,
    onSettled: async (data, error, body, context) => {
      if (data) {
        queryClient.setQueryData(["knowledge-item", itemId], data);
      }
      try {
        await options.onSettled?.(data, error, body, context);
      } catch (callbackError) {
        /* ISOLATED ON PURPOSE. This runs inside query-core's own lifecycle
           await (mutation.js, the success path), so letting a caller's
           rejection escape would drop into ITS catch: onError fires, THIS
           callback runs a second time with (undefined, error), the mutation
           dispatches `error` and mutateAsync rejects — reporting a failed
           save for a PATCH the server already committed and the cache
           already holds. 5.4 hangs async Save-and-approve here (D12), so a
           failing approve must not retroactively fail the edit. The callback
           owns its own errors; we only make sure they are not silent. */
        console.error(
          "useUpdateKnowledgeItem: onSettled callback rejected after a committed patch",
          callbackError,
        );
      } finally {
        void queryClient.invalidateQueries({ queryKey: ["review-items"] });
      }
    },
  });
}
