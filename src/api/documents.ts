import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { request } from "./client";
import { route } from "./routes";
import type {
  DocumentDetailResponse,
  DocumentListItem,
  DocumentListResponse,
} from "./types";

/* The backend pages this endpoint (default 50 rows, max 200) and returns no
   total, so a single unparameterised call silently truncates the shelf — and
   both `cookbookCount` and the ready-recipes fan-out treat what comes back as
   the whole of it. Walk pages until one comes back short. */
const LIST_PAGE_SIZE = 200;
/** Hard stop at 5000 documents so a mispaging backend cannot spin forever. */
const LIST_MAX_PAGES = 25;

async function fetchAllDocuments(): Promise<DocumentListResponse> {
  const documents: DocumentListItem[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const batch = await request<DocumentListResponse>(
      route("/documents", "get", {
        query: {
          limit: String(LIST_PAGE_SIZE),
          offset: String(page * LIST_PAGE_SIZE),
        },
      }),
    );
    for (const doc of batch.documents) {
      /* Offsets shift under a concurrent insert, which can repeat a row
         across pages; ids keep the shelf count honest either way. */
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        documents.push(doc);
      }
    }
    if (batch.documents.length < LIST_PAGE_SIZE) {
      break;
    }
  }

  return { documents };
}

export function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: fetchAllDocuments,
  });
}

/* The shared ['document', id] factory — 2.2's useDocument and the shelf
   fan-out both consume it, so the cache entry has exactly one shape. The
   enabled guard lives here because 2.2 calls it with an id that is
   undefined on first render (dependent query). */
export function documentDetailQueryOptions(id: string | undefined) {
  return queryOptions({
    queryKey: ["document", id],
    enabled: Boolean(id),
    queryFn: () =>
      request<DocumentDetailResponse>(
        route("/documents/{document_id}", "get", {
          params: { document_id: id as string },
        }),
      ),
  });
}

export interface ShelfStats {
  cookbookCount: number | undefined;
  /** Sum of `counts.ready_items`; `undefined` until every book has settled. */
  readyRecipes: number | undefined;
  /** True when at least one book's counts could not be fetched, so
      `readyRecipes` is a floor rather than an exact total. Lets the caller
      distinguish a short sum from a complete one — `readyRecipes: undefined`
      alone would conflate "still loading" with "one book failed". */
  partial: boolean;
  /** The shelf list itself failed terminally (401, exhausted 5xx retries,
      network). Without this the caller cannot tell a dead request from a slow
      one — `cookbookCount === undefined` means both — and would sit on a
      loading message forever. */
  unavailable: boolean;
}

/* Module-level combine keeps the reference stable across renders.

   The sum resolves once every detail query has SETTLED — success or error
   (TASK-001, D2). Waiting for all-success would hang the figure forever behind
   one 404/500, and the 1.2 client retries 5xx twice, so a failing book would
   flicker the hero.

   But settling on an error must not pass a short sum off as an exact total:
   summing the survivors silently published a plausible-but-false "N recipes
   ready". The failure is therefore reported rather than swallowed — `partial`
   marks the sum as a floor, which the hero renders as "212+". `readyRecipes`
   still resolves, which is what TASK-001 requires.

   An empty shelf is not an unknown one: zero books legitimately sum to 0
   (`every` on an empty array is true). The pre-load case is handled by the
   caller, which has no ids to fan out over until the list resolves. */
function combineReadyRecipes(
  results: {
    data?: DocumentDetailResponse;
    isSuccess: boolean;
    isError: boolean;
  }[],
): { readyRecipes: number | undefined; partial: boolean } {
  const allSettled = results.every((r) => r.isSuccess || r.isError);
  if (!allSettled) {
    return { readyRecipes: undefined, partial: false };
  }
  return {
    readyRecipes: results.reduce(
      (sum, r) => sum + (r.isSuccess ? (r.data?.counts.ready_items ?? 0) : 0),
      0,
    ),
    partial: results.some((r) => r.isError),
  };
}

export function useShelfStats(): ShelfStats {
  const documents = useDocuments();
  const ids = documents.data?.documents.map((d) => d.id) ?? [];

  const { readyRecipes, partial } = useQueries({
    queries: ids.map((id) => documentDetailQueryOptions(id)),
    combine: combineReadyRecipes,
  });

  return {
    cookbookCount: documents.data?.documents.length,
    /* Until the list resolves there is nothing to fan out over, and the
       combine's empty-array zero would read as "empty shelf" rather than
       "not known yet". */
    readyRecipes: documents.data ? readyRecipes : undefined,
    partial,
    unavailable: documents.isError,
  };
}
