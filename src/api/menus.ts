import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { request } from "./client";
import { REVIEW_INCLUDED_FILTERS } from "./filters";
import { route } from "./routes";
import type { components } from "./schema";
import type { SearchMode } from "./search";
import type { MenuResponse } from "./types";

/* POST /menus — the multi-course sibling of `answers.ts`, and deliberately
   the same shape: an ask is the cache key, nothing fetches on its own, and
   `run()` under an explicit click is the only thing that spends. A menu is
   two LLM round-trips (plan, then selection) plus one retrieval per course,
   so every rule that keeps an answer from auto-firing matters twice here. */

const menusEndpoint = route("/menus", "post");

type MenuPayload = Pick<components["schemas"]["MenuRequestBody"], "query"> & {
  retrieval: Pick<components["schemas"]["MenuRetrievalOptions"], "mode">;
  menu: Pick<components["schemas"]["MenuOptions"], "include_candidates">;
} & Partial<Pick<components["schemas"]["MenuRequestBody"], "filters">>;

/** The request a menu belongs to — same triple as `AnswerAsk`, same reason:
    it is both the body's source and the cache key. */
export interface MenuAsk {
  query: string;
  mode: SearchMode;
  reviewIncluded: boolean;
}

/** As `ANSWER_GC_TIME`: a detour through a recipe must not cost the menu. */
export const MENU_GC_TIME = 30 * 60_000;

/** The service degrades every failure to a warning-carrying 200 — the picks
    are then top-scoring candidates with no rationale. Discriminated on
    warnings alone, never on error status. */
export function isMenuFallback(response: MenuResponse): boolean {
  return response.warnings.length > 0;
}

function menuQueryOptions(ask: MenuAsk | null) {
  return {
    queryKey:
      ask === null
        ? ["menu", "unasked"]
        : ["menu", ask.query, ask.mode, ask.reviewIncluded],
    /* Never automatic — see answers.ts for the full argument. */
    enabled: false,
    retry: false,
    networkMode: "always" as const,
    gcTime: MENU_GC_TIME,
    queryFn: () => {
      if (ask === null) {
        throw new Error("menu requested without an ask");
      }
      const payload: MenuPayload = {
        query: ask.query,
        retrieval: { mode: ask.mode },
        /* The card renders the picks; the per-course candidate lists would
           multiply the payload by the candidate cap for nothing. */
        menu: { include_candidates: false },
      };
      if (ask.reviewIncluded) {
        payload.filters = REVIEW_INCLUDED_FILTERS;
      }
      return request<MenuResponse>(menusEndpoint, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
  };
}

/**
 * The menu for `ask` — read from the cache, never fetched on its own.
 * `run(ask)` is the explicit action that buys one. Read `isFetching`, not
 * `isPending`, for the in-flight state.
 */
export function useMenu(ask: MenuAsk | null) {
  const client = useQueryClient();
  const query = useQuery(menuQueryOptions(ask));

  const run = useCallback(
    (next: MenuAsk) => {
      /* fetchQuery by key, as useAnswer: the same click commits ?menu=1, so
         the observer is still bound to the previous key for one render. */
      client.fetchQuery(menuQueryOptions(next)).catch(() => {
        /* Rendered from cache state by the observer above. */
      });
    },
    [client],
  );

  return { ...query, run };
}
