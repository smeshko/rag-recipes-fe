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

/* The results plus the mode that actually produced them. The two come as one
   value because they can disagree: D7's placeholder deliberately keeps the
   previous mode's results on screen while a newly-selected mode is still in
   flight, and during that window the URL's mode is NOT the rendered cards'
   mode. Labelling or linking those cards with the URL's mode would hand a
   hybrid result a `state.mode: 'vector'` — precisely the "vector-mode search
   must not return to hybrid results" failure D1's corollary rules out. */
export interface SearchResult {
  mode: SearchMode;
  response: SearchResponse;
}

export function useSearch(q: string, mode: SearchMode) {
  return useQuery({
    queryKey: ["search", q, mode],
    enabled: q !== "",
    /* Mode-scoped: a mode toggle on the same query keeps the previous grid
       (dimmed via isPlaceholderData); a new query gets a fresh skeleton. */
    placeholderData: (
      prev: SearchResult | undefined,
      prevQuery: { queryKey: readonly unknown[] } | undefined,
    ) => (prevQuery?.queryKey[1] === q ? prev : undefined),
    queryFn: async (): Promise<SearchResult> => {
      const payload: SearchPayload = { query: q, mode };
      /* The 1.2 client doesn't serialize — body + Content-Type are ours. */
      const response = await request<SearchResponse>(searchEndpoint, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
      return { mode, response };
    },
  });
}
