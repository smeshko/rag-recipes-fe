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
  KnowledgeItemListResponse,
  KnowledgeItemResponse,
  KnowledgeItemSummary,
  KnowledgeItemUpdateRequest,
} from "./types";

/* Same page-walk contract as the shelf and the review queue (DECISIONS.md D6):
   the response carries no total, so walk `limit`/`offset` until a page comes
   back short. Same constants as documents.ts — see the cap commentary there;
   the bound is on REQUESTS, not items. */
const LIST_PAGE_SIZE = 200;
const LIST_MAX_PAGES = 25;

/** Every page of one book's items, deduped by id (offsets shift under a
    concurrent delete exactly as they do under a concurrent upload). */
export async function fetchAllDocumentKnowledgeItems(
  documentId: string,
  status?: string,
): Promise<KnowledgeItemListResponse> {
  const items: KnowledgeItemSummary[] = [];
  const seen = new Set<string>();

  for (let page = 0; page <= LIST_MAX_PAGES; page += 1) {
    const batch = await request<KnowledgeItemListResponse>(
      route("/documents/{document_id}/knowledge-items", "get", {
        params: { document_id: documentId },
        query: {
          /* undefined → serializeQuery drops the param entirely, which is what
             makes "no filter" and "filter by nothing" the same request. */
          status: status,
          limit: String(LIST_PAGE_SIZE),
          offset: String(page * LIST_PAGE_SIZE),
        },
      }),
    );
    for (const item of batch.knowledge_items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
    if (batch.knowledge_items.length < LIST_PAGE_SIZE) {
      return { knowledge_items: items };
    }
  }

  throw new PaginationCapError(LIST_MAX_PAGES + 1);
}

/** The single source of the ['knowledge-items', …] cache entries. `undefined`
    maps to key segment `null` so the unfiltered list has a stable key; the
    delete mutation invalidates the bare ['knowledge-items'] prefix to catch
    every filter variant at once. */
export function documentKnowledgeItemsQueryOptions(
  documentId: string | undefined,
  status?: string,
) {
  return queryOptions({
    queryKey: ["knowledge-items", documentId ?? null, status ?? null],
    enabled: Boolean(documentId),
    queryFn: () => fetchAllDocumentKnowledgeItems(documentId as string, status),
  });
}

export function useDocumentKnowledgeItems(
  documentId: string | undefined,
  status?: string,
) {
  return useQuery(documentKnowledgeItemsQueryOptions(documentId, status));
}

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
  /* Runs after the ['knowledge-item', id] write and before the
     ['review-items'] invalidation (D12).

     IT OWNS ITS OWN FAILURES. A rejection here is caught by the hook and
     logged, never turned into mutation error state: the PATCH has committed
     and the cache holds the server's item, so reporting a failed save would
     be a lie. A caller chaining async work off this seam — 5.4's
     Save-and-approve is the case it exists for — must therefore try/catch
     INSIDE the callback and render the downstream failure from its own
     state (`approveFailed`, a toast, whatever), not from `isError` or a
     rejected `mutateAsync`. */
  onSettled?: (
    data: KnowledgeItemResponse | undefined,
    error: Error | null,
    body: KnowledgeItemUpdateRequest,
    context: TContext | undefined,
  ) => Promise<unknown> | unknown;
}

/**
 * PATCH /knowledge-items/{item_id} — an in-place edit. The response is the GET
 * body field-for-field, with `review_reasons` recomputed and `edited_at`
 * stamped (docs/edit-api-contract.md).
 *
 * TWO server-side paths, and the response `status` is the only way to tell
 * them apart: a `needs_review` item comes back `needs_review` (a pure row
 * rewrite), while a `ready` one comes back `indexing` — the backend dropped
 * its chunks and queued a re-embed, so the recipe has left the shelf and left
 * search until a worker puts it back. See the invalidation note on `onSettled`
 * below: which caches move depends on which path ran.
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
 * 2. Invalidations are CONDITIONAL on the path the server took (PLAN D6, since
 *    widened). ['review-items'] always settles — success and failure alike,
 *    because a 404 means the card was stale and refreshing the queue is the
 *    fix. The original D6 reasoning ("an edit leaves the item `needs_review`,
 *    so no shelf count moves") holds only for that path and is now guarded by
 *    it: editing a `ready` item moves it out of `ready_items` and drops its
 *    chunks, so ['documents'], the exact ['document', id] and the
 *    ['knowledge-items'] listings are all stale the moment it returns. `exact`
 *    on the document entry so ['document', id, 'status'] polling is never
 *    refired — `invalidateOnTerminal`'s documented trap in documents.ts.
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
        /* `data` is absent on failure — nothing committed, nothing to sync. */
        if (data && data.knowledge_item.status !== "needs_review") {
          void queryClient.invalidateQueries({ queryKey: ["knowledge-items"] });
          void queryClient.invalidateQueries({ queryKey: ["documents"] });
          void queryClient.invalidateQueries({
            queryKey: ["document", data.knowledge_item.document_id],
            exact: true,
          });
        }
      }
    },
  });
}

/** Same seam, same reason as `UseUpdateKnowledgeItemOptions` above: TanStack v5
    accepts onSuccess/onError/onSettled per `mutate()` call but NOT `onMutate`,
    so a card that wants an optimistic removal has to be handed the hook. */
export interface UseDeleteKnowledgeItemOptions<TContext = unknown> {
  onMutate?: () => Promise<TContext> | TContext;
  onError?: (
    error: Error,
    context: TContext | undefined,
  ) => Promise<unknown> | unknown;
  onSettled?: (
    error: Error | null,
    context: TContext | undefined,
  ) => Promise<unknown> | unknown;
}

/**
 * DELETE /knowledge-items/{item_id} — the per-recipe hard delete. 204, no body.
 *
 * Permanent: the row, its chunks and its embeddings are gone, and recovery is
 * reprocessing the whole book. Callers must confirm before firing.
 *
 * `documentId` is required rather than read off the (now deleted) item: the
 * exact ['document', id] entry holds the counts this delete just moved, and
 * after a 204 there is no response body to learn the id from.
 *
 * Everything a delete can touch is invalidated on settle, success AND failure —
 * a 404 means the row was already gone, and refreshing is exactly the fix:
 * ['knowledge-items'] (bare prefix, every filter variant), ['review-items']
 * (the item may have been flagged), ['documents'] (shelf counts) and the EXACT
 * ['document', documentId] — exact so the ['document', id, 'status'] polling
 * entry is never refired.
 */
export function useDeleteKnowledgeItem<TContext = unknown>(
  itemId: string,
  documentId: string,
  options: UseDeleteKnowledgeItemOptions<TContext> = {},
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void, TContext>({
    mutationFn: async () => {
      await request<void>(
        route("/knowledge-items/{item_id}", "delete", {
          params: { item_id: itemId },
        }),
      );
    },
    onMutate: options.onMutate,
    onError: (error, _variables, context) => options.onError?.(error, context),
    onSettled: async (_data, error, _variables, context) => {
      try {
        await options.onSettled?.(error, context);
      } finally {
        void queryClient.invalidateQueries({ queryKey: ["knowledge-items"] });
        void queryClient.invalidateQueries({ queryKey: ["review-items"] });
        void queryClient.invalidateQueries({ queryKey: ["documents"] });
        void queryClient.invalidateQueries({
          queryKey: ["document", documentId],
          exact: true,
        });
      }
    },
  });
}
