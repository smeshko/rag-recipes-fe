import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { request } from "./client";
import { REVIEW_INCLUDED_FILTERS } from "./filters";
import { route } from "./routes";
import type { components } from "./schema";
import type { SearchMode } from "./search";
import type { AnswerResponse } from "./types";

const answersEndpoint = route("/answers", "post");

/* Pick-composed subset of the generated schema: the full AnswerRequestBody
   marks every defaulted field required, so the defaults-riding body cannot
   be annotated as the full type. Never re-declare field names by hand. */
type AnswerPayload = Pick<
  components["schemas"]["AnswerRequestBody"],
  "query"
> & {
  retrieval: Pick<components["schemas"]["AnswerRetrievalOptions"], "mode">;
  answer: Pick<components["schemas"]["AnswerOptions"], "include_results">;
} & Partial<Pick<components["schemas"]["AnswerRequestBody"], "filters">>;

/** The question an answer belongs to. Same triple, same answer — it is both
    the request body's source and the cache key, so an answer can only ever be
    read back under the query, mode and corpus it was actually asked about. */
export interface AnswerAsk {
  query: string;
  mode: SearchMode;
  /** Armed by the library's review link-out. `/answers` runs its own
      retrieval under the same SearchFilters default, so leaving it off here
      would answer from a filtered corpus on a page that says the filter is
      armed — and the fallback path renders those results as a browse grid,
      silently swapping an armed grid for an unarmed one. */
  reviewIncluded: boolean;
}

/** How long an answer nobody is looking at stays restorable. A detour through
    a recipe (or three) must not cost a second LLM round-trip; the default five
    minutes is short enough that a real read of a recipe would outlast it. */
export const ANSWER_GC_TIME = 30 * 60_000;

/** Fallback is discriminated on warnings alone — never on error status. */
export function isFallback(response: AnswerResponse): boolean {
  return response.warnings.length > 0;
}

function answerQueryOptions(ask: AnswerAsk | null) {
  return {
    queryKey:
      ask === null
        ? ["answer", "unasked"]
        : ["answer", ask.query, ask.mode, ask.reviewIncluded],
    /* Never automatic: not on mount, not on focus, not on reconnect, not on a
       key change. An answer costs an LLM round-trip, so the only thing that
       may ever spend one is run() under an explicit click. A disabled observer
       still mirrors its cache entry, and that is what makes a remount — Back
       from a recipe — restore the answer for free instead of losing it. */
    enabled: false,
    retry: false,
    /* networkMode 'always' because the default 'online' pauses an offline
       fetch and fires it on reconnect — a genuine violation of
       answers-only-on-explicit-action. */
    networkMode: "always" as const,
    gcTime: ANSWER_GC_TIME,
    queryFn: () => {
      if (ask === null) {
        /* Unreachable: the unasked key is disabled and run() is typed to a
           real ask. Loud rather than a silent request with an empty query. */
        throw new Error("answer requested without an ask");
      }
      const payload: AnswerPayload = {
        query: ask.query,
        retrieval: { mode: ask.mode },
        answer: { include_results: false },
      };
      if (ask.reviewIncluded) {
        payload.filters = REVIEW_INCLUDED_FILTERS;
      }
      return request<AnswerResponse>(answersEndpoint, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
  };
}

/**
 * The answer for `ask` — read from the cache, never fetched on its own.
 * `run(ask)` is the explicit action that buys one.
 *
 * Pass `null` when nothing has been asked for the search on screen.
 *
 * `isPending` is meaningless here: a query that never auto-fetches is pending
 * forever. Read `isFetching` for the in-flight state and `data` for the
 * answer itself.
 */
export function useAnswer(ask: AnswerAsk | null) {
  const client = useQueryClient();
  const query = useQuery(answerQueryOptions(ask));

  const run = useCallback(
    (next: AnswerAsk) => {
      /* fetchQuery, not refetch(): the same click commits a new ?q=, so this
         observer is still bound to the previous key for one more render.
         Fetching by key writes into the entry the re-rendered observer lands
         on. It also dedupes concurrent fetches of one key, which is what makes
         a double-click buy exactly one round-trip.
         The rejection is the observer's to render (isError) — swallowed here
         so a failed answer is not also an unhandled rejection. */
      client.fetchQuery(answerQueryOptions(next)).catch(() => {
        /* Rendered from cache state by the observer above. */
      });
    },
    [client],
  );

  return { ...query, run };
}
