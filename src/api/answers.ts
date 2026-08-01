import { useMutation } from "@tanstack/react-query";
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

/** Fallback is discriminated on warnings alone — never on error status. */
export function isFallback(response: AnswerResponse): boolean {
  return response.warnings.length > 0;
}

export function useAnswer() {
  return useMutation({
    /* LLM calls never auto-retry; networkMode 'always' because the default
       'online' pauses an offline mutation and auto-fires it on reconnect —
       a genuine violation of answers-only-on-explicit-action. */
    retry: false,
    networkMode: "always",
    mutationFn: ({
      query,
      mode,
      reviewIncluded = false,
    }: {
      query: string;
      mode: SearchMode;
      /** Armed by the library's review link-out. `/answers` runs its own
          retrieval under the same SearchFilters default, so leaving it off
          here would answer from a filtered corpus on a page that says the
          filter is armed — and the fallback path renders those results as a
          browse grid, silently swapping an armed grid for an unarmed one. */
      reviewIncluded?: boolean;
    }) => {
      const payload: AnswerPayload = {
        query,
        retrieval: { mode },
        answer: { include_results: false },
      };
      if (reviewIncluded) {
        payload.filters = REVIEW_INCLUDED_FILTERS;
      }
      return request<AnswerResponse>(answersEndpoint, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
  });
}
