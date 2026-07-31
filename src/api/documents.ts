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

/* Module-level combine keeps the reference stable across renders. The sum
   resolves once every detail query has settled (success OR error) — waiting
   for all-success would hang the figure forever behind one failing book. */
function combineReadyRecipes(
  results: {
    data?: DocumentDetailResponse;
    isSuccess: boolean;
    isError: boolean;
  }[],
): number | undefined {
  if (results.length === 0) {
    return undefined;
  }
  const allSettled = results.every((r) => r.isSuccess || r.isError);
  if (!allSettled) {
    return undefined;
  }
  return results.reduce(
    (sum, r) => sum + (r.isSuccess ? (r.data?.counts.ready_items ?? 0) : 0),
    0,
  );
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
    readyRecipes,
  };
}
