import { useQuery } from "@tanstack/react-query";
import { request } from "./client";
import { route } from "./routes";
import type { components } from "./schema";
import type { SearchMode, SearchResponse } from "./types";

export type { SearchMode };

const searchEndpoint = route("/search", "post");

/* Pick<> because openapi-typescript emits defaulted fields as required —
   the full generated body cannot be satisfied by two fields, and the backend
   supplies every other default server-side. */
type SearchPayload = Pick<
  components["schemas"]["SearchRequestBody"],
  "query" | "mode"
>;

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

export function useSearch(q: string, mode: SearchMode) {
  const query = useQuery({
    queryKey: ["search", q, mode],
    enabled: q !== "",
    /* Mode-scoped: a mode toggle on the same query keeps the previous grid
       (dimmed via isPlaceholderData); a new query gets a fresh skeleton. */
    placeholderData: (
      prev: SearchQueryData | undefined,
      prevQuery: { queryKey: readonly unknown[] } | undefined,
    ) => (prevQuery?.queryKey[1] === q ? prev : undefined),
    queryFn: async (): Promise<SearchQueryData> => {
      const payload: SearchPayload = { query: q, mode };
      /* The 1.2 client doesn't serialize — body + Content-Type are ours. */
      const response = await request<SearchResponse>(searchEndpoint, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
      return { mode, response };
    },
  });

  return {
    ...query,
    /** `SearchResponse` per TASK-001's contract. */
    data: query.data?.response,
    /** The mode that produced `data` — not necessarily the requested `mode`
        while a mode change is still in flight. */
    resultsMode: query.data?.mode ?? mode,
  };
}
