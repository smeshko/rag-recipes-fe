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

export function useSearch(q: string, mode: SearchMode) {
  return useQuery({
    queryKey: ["search", q, mode],
    enabled: q !== "",
    /* Mode-scoped: a mode toggle on the same query keeps the previous grid
       (dimmed via isPlaceholderData); a new query gets a fresh skeleton. */
    placeholderData: (
      prev: SearchResponse | undefined,
      prevQuery: { queryKey: readonly unknown[] } | undefined,
    ) => (prevQuery?.queryKey[1] === q ? prev : undefined),
    queryFn: () => {
      const payload: SearchPayload = { query: q, mode };
      /* The 1.2 client doesn't serialize — body + Content-Type are ours. */
      return request<SearchResponse>(searchEndpoint, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
    },
  });
}
