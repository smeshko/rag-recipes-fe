import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { request } from "./client";
import { route } from "./routes";
import type { DocumentDetailResponse, DocumentListResponse } from "./types";

const documentsEndpoint = route("/documents", "get");

export function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: () => request<DocumentListResponse>(documentsEndpoint),
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
  readyRecipes: number | undefined;
}

/* Module-level combine keeps the reference stable across renders.

   The sum is published only when EVERY book has reported. A failed detail
   query makes the total unknowable, not zero: treating it as zero produced a
   plausible-but-false "N recipes ready" with nothing on screen to say the
   figure was short. `undefined` instead keeps the hero in the intermediate
   state it already has a design for — cookbook count on its own, recipe
   segment omitted until the sum settles (D2, TASK-002).

   An empty shelf is not an unknown one: zero books legitimately sum to 0, and
   `every` on an empty array is true, so a genuinely empty shelf reports 0
   rather than hiding the segment forever. The pre-load case is covered by the
   caller, which has no ids to fan out over until the list resolves. */
function combineReadyRecipes(
  results: {
    data?: DocumentDetailResponse;
    isSuccess: boolean;
  }[],
): number | undefined {
  if (!results.every((r) => r.isSuccess)) {
    return undefined;
  }
  return results.reduce((sum, r) => sum + (r.data?.counts.ready_items ?? 0), 0);
}

export function useShelfStats(): ShelfStats {
  const documents = useDocuments();
  const ids = documents.data?.documents.map((d) => d.id) ?? [];

  const readyRecipes = useQueries({
    queries: ids.map((id) => documentDetailQueryOptions(id)),
    combine: combineReadyRecipes,
  });

  return {
    cookbookCount: documents.data?.documents.length,
    /* Until the list resolves there is nothing to fan out over, and the
       combine's empty-array zero would read as "empty shelf" rather than
       "not known yet". */
    readyRecipes: documents.data ? readyRecipes : undefined,
  };
}
