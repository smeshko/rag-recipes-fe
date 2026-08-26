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
  FavouriteResponse,
  KnowledgeItemListResponse,
  KnowledgeItemResponse,
  KnowledgeItemSummary,
} from "./types";

/* Favourites hooks. `GET /favourites` returns the SAME listing row the shelf
   and the review queue return (the backend reuses one projection), so nothing
   here re-describes a recipe card — it walks pages and hands back
   `KnowledgeItemListResponse` exactly as `knowledgeItems.ts` does. */

/* Same page-walk contract as the shelf and the review queue (ARCHITECTURE.md "Page walk"):
   the response carries no total, so walk `limit`/`offset` until a page comes
   back short. Same constants as documents.ts — see the cap commentary there;
   the bound is on REQUESTS, not items. */
const LIST_PAGE_SIZE = 200;
const LIST_MAX_PAGES = 25;

/** Every page of favourites, newest star first, deduped by id (offsets shift
    under a concurrent unstar exactly as they do under a concurrent upload). */
export async function fetchAllFavourites(): Promise<KnowledgeItemListResponse> {
  const items: KnowledgeItemSummary[] = [];
  const seen = new Set<string>();

  for (let page = 0; page <= LIST_MAX_PAGES; page += 1) {
    const batch = await request<KnowledgeItemListResponse>(
      route("/favourites", "get", {
        query: {
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

/** The single source of the ['favourites'] cache entry. Unfiltered — the
    endpoint takes no filter — so unlike the shelf and the queue there is no
    key segment to vary, and the toggle can address it exactly. */
export function favouritesQueryOptions() {
  return queryOptions({
    queryKey: ["favourites"],
    queryFn: fetchAllFavourites,
  });
}

export function useFavourites() {
  return useQuery(favouritesQueryOptions());
}

/**
 * The starred ids, for surfaces whose own rows cannot answer the question.
 *
 * A recipe page and a book row each carry their own `favourited_at`, so they
 * know already. A SEARCH result does not: `/search` projects the retrieval
 * layer and deliberately knows nothing about stars, so the search page reads
 * the set once and hands each card a boolean.
 *
 * `select` rather than a second query: the derived Set rides on the same
 * ['favourites'] entry the page and the toggle already share, so it cannot
 * drift from them and costs no extra request.
 */
export function useFavouriteIds() {
  return useQuery({
    ...favouritesQueryOptions(),
    select: (data: KnowledgeItemListResponse) =>
      new Set(data.knowledge_items.map((item) => item.id)),
  });
}

/**
 * PUT / DELETE `/knowledge-items/{item_id}/favourite` — one item's star.
 *
 * `mutate(next)`: `true` stars, `false` unstars. Both verbs are idempotent
 * server-side, so a retry after a dropped response is safe and a double-click
 * cannot double-star.
 *
 * ON SUCCESS THE STAR IS WRITTEN, NOT INVALIDATED — `useUpdateKnowledgeItem`'s
 * D5, and here it is not just an optimization. `favourited_at` is the only
 * field this request moves and the response carries its new value, so the
 * cache can be corrected exactly. Invalidating instead would leave the recipe
 * page rendering the pre-click value for the length of a refetch: the star
 * would fill, empty and fill again on one click.
 *
 * That write is field-level on rows that already exist. NOTHING IS
 * SYNTHESIZED: starring from a search card cannot insert a row into
 * ['favourites'], because a listing row carries page spans, flags and an
 * extraction block that a search result does not have, and a half-invented
 * recipe in a shared cache is worse than a refetch. So ['favourites'] is
 * invalidated rather than written — except on the unstar path, where removal
 * needs no invention and is `RecipeRow`'s delete idiom: cancel, snapshot,
 * filter, roll back on error.
 *
 * NOT touched: ['review-items'] (its rows carry `favourited_at` too, but the
 * queue renders no star) and ['documents'] (a star moves no shelf count).
 */
export function useToggleFavourite(itemId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    FavouriteResponse | null,
    Error,
    boolean,
    KnowledgeItemListResponse | undefined
  >({
    /* Toggles of the SAME item run one at a time (TanStack v5 mutation scope).
       Load-bearing: a PUT and a DELETE in flight together would land in
       whatever order the network chose, and the star would settle on the wrong
       state with nothing to correct it. */
    scope: { id: `favourite-${itemId}` },
    mutationFn: async (next) => {
      if (!next) {
        await request<void>(
          route("/knowledge-items/{item_id}/favourite", "delete", {
            params: { item_id: itemId },
          }),
        );
        return null;
      }
      return request<FavouriteResponse>(
        route("/knowledge-items/{item_id}/favourite", "put", {
          params: { item_id: itemId },
        }),
      );
    },
    onMutate: async (next) => {
      if (next) {
        return undefined;
      }
      await queryClient.cancelQueries({ queryKey: ["favourites"] });
      const snapshot = queryClient.getQueryData<KnowledgeItemListResponse>([
        "favourites",
      ]);
      queryClient.setQueryData<KnowledgeItemListResponse>(
        ["favourites"],
        (current) =>
          current && {
            knowledge_items: current.knowledge_items.filter(
              (candidate) => candidate.id !== itemId,
            ),
          },
      );
      return snapshot;
    },
    onSuccess: (data, next) => {
      /* The server's own timestamp on the star path (idempotent PUT: a repeat
         returns the FIRST one, so this is not "now"), null on the unstar. */
      const favouritedAt = next
        ? (data?.favourite.favourited_at ?? null)
        : null;

      queryClient.setQueryData<KnowledgeItemResponse>(
        ["knowledge-item", itemId],
        (current) =>
          current && {
            ...current,
            knowledge_item: {
              ...current.knowledge_item,
              favourited_at: favouritedAt,
            },
          },
      );
      /* Every book-contents variant at once — the filtered and unfiltered
         lists can both hold this row. */
      queryClient.setQueriesData<KnowledgeItemListResponse>(
        { queryKey: ["knowledge-items"] },
        (current) =>
          current && {
            knowledge_items: current.knowledge_items.map((row) =>
              row.id === itemId ? { ...row, favourited_at: favouritedAt } : row,
            ),
          },
      );
    },
    onError: (_error, _next, snapshot) => {
      /* Only the unstar path snapshots, so this restores exactly what it
         removed; the star path leaves `snapshot` undefined and nothing to do.
         The failure itself is rendered by the button, from `isError`. */
      if (snapshot !== undefined) {
        queryClient.setQueryData(["favourites"], snapshot);
      }
    },
    onSettled: () => {
      /* The list, and only the list: a star that was just ADDED needs the
         server to describe its row. A failed toggle refetches too — the star
         may have landed and the response been lost. */
      void queryClient.invalidateQueries({ queryKey: ["favourites"] });
    },
  });
}
