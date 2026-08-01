import { queryOptions, useQuery } from "@tanstack/react-query";
import { request } from "./client";
import { REVIEW_INCLUDED_FILTERS } from "./filters";
import { route } from "./routes";
import type { components } from "./schema";
import type { SearchMode, SearchResponse } from "./types";

export type { SearchMode };

const searchEndpoint = route("/search", "post");

/* Pick<> because openapi-typescript emits defaulted fields as required —
   the full generated body cannot be satisfied by two fields, and the backend
   supplies every other default server-side.

   `filters` is optional here and sent ONLY when the needs-review filter is
   armed (see REVIEW_INCLUDED_FILTERS); the unarmed body stays exactly
   `{query, mode}`. */
type SearchPayload = Pick<
  components["schemas"]["SearchRequestBody"],
  "query" | "mode"
> &
  Partial<Pick<components["schemas"]["SearchRequestBody"], "filters">>;

/* Cached alongside the response: the mode that actually produced it. The two
   can disagree — D7's placeholder deliberately keeps the previous mode's
   results on screen while a newly-selected mode is still in flight, and during
   that window the URL's mode is NOT the rendered cards' mode. Labelling or
   linking those cards with the URL's mode hands a hybrid result a
   `state.mode: 'vector'` — the exact "vector-mode search must not return to
   hybrid results" failure D1's corollary rules out.

   This wrapper stays INTERNAL. TASK-001 specifies the hook "returns the
   fixture results typed as `SearchResponse`", so `data` is unwrapped back to
   that shape and the producing mode is exposed beside it as `resultsMode`.
   Consumers keep reading `data.results`. */
interface SearchQueryData {
  mode: SearchMode;
  response: SearchResponse;
}

function searchQueryOptions(
  q: string,
  mode: SearchMode,
  reviewIncluded: boolean,
) {
  return queryOptions({
    /* reviewIncluded is part of the key: the same q+mode returns a different
       result set with the filter armed, so the two must not share a cache
       entry. It sits AFTER mode so the placeholderData probe on index 1
       (the query string) is unaffected. */
    queryKey: ["search", q, mode, reviewIncluded],
    enabled: q !== "",
    /* Mode-scoped: a mode toggle on the same query keeps the previous grid
       (dimmed via isPlaceholderData); a new query gets a fresh skeleton. */
    placeholderData: (
      prev: SearchQueryData | undefined,
      prevQuery: { queryKey: readonly unknown[] } | undefined,
    ) => (prevQuery?.queryKey[1] === q ? prev : undefined),
    queryFn: async (): Promise<SearchQueryData> => {
      const payload: SearchPayload = { query: q, mode };
      if (reviewIncluded) {
        payload.filters = REVIEW_INCLUDED_FILTERS;
      }
      /* The 1.2 client doesn't serialize — body + Content-Type are ours. */
      const response = await request<SearchResponse>(searchEndpoint, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
      return { mode, response };
    },
  });
}

/**
 * @param reviewIncluded arms `filters.exclude_needs_review: false` — set from
 * the `review=included` URL param the library's review link-out carries.
 */
export function useSearch(q: string, mode: SearchMode, reviewIncluded = false) {
  const options = searchQueryOptions(q, mode, reviewIncluded);
  /* Unwrap with `select`, at the OBSERVER — not by overriding `data` on the
     returned object. `select` is what makes EVERY data-bearing member of the
     result a `SearchResponse`: `data`, `await refetch()`, and `promise`.
     Patching `data` alone left `refetch()` handing back the internal wrapper,
     so the "internal" shape leaked through a documented API. */
  const query = useQuery({ ...options, select: (d) => d.response });
  /* A second observer on the SAME key — one query, one fetch, deduped by
     TanStack — selecting only the producing mode. Keeps the mode available
     across D7's placeholder window without putting it in the response. */
  const producing = useQuery({ ...options, select: (d) => d.mode });

  return {
    ...query,
    /** The mode that produced `data` — not necessarily the requested `mode`
        while a mode change is still in flight. */
    resultsMode: producing.data ?? mode,
  };
}
