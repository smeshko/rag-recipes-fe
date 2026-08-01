import type { AnswerAsk } from "../../api";
import { parseMode } from "./mode";

/**
 * The ask the answer on screen belongs to, remembered so a detour through a
 * recipe and back restores the answer instead of throwing it away — the search
 * route unmounts on that navigation, so nothing held in component state
 * survives it. The answer itself lives in the query cache; this is only the
 * note saying which one to look for.
 *
 * sessionStorage for the same reason as the last search: per-tab, gone when
 * the tab closes (plan decision D2). It deliberately does NOT survive a
 * reload — the cache does not either, and re-fetching an answer nobody asked
 * for again would spend an LLM round-trip behind the user's back.
 */
export const LAST_ASK_KEY = "sk:last-ask";

/* Every storage access is guarded: sessionStorage can throw (private windows,
   storage disabled), and remembering an ask is never worth an error — a
   failure degrades to "nothing to restore". */

export function saveLastAsk(ask: AnswerAsk): void {
  try {
    sessionStorage.setItem(LAST_ASK_KEY, JSON.stringify(ask));
  } catch {
    /* Storage unavailable — the answer simply won't survive a detour. */
  }
}

export function clearLastAsk(): void {
  try {
    sessionStorage.removeItem(LAST_ASK_KEY);
  } catch {
    /* Nothing to clear if storage never worked. */
  }
}

/**
 * The remembered ask, but only when it still describes the search on screen:
 * another query, or the same query over another corpus, is another question
 * and must not restore this answer.
 *
 * The mode is the ASK's, not the URL's. A mode chip after an answer leaves the
 * answer standing (`/answers` ran its own retrieval), so its provenance stays
 * whatever it was asked at.
 */
export function armedAsk(q: string, reviewIncluded: boolean): AnswerAsk | null {
  if (q === "") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(LAST_ASK_KEY);
    if (raw === null) {
      return null;
    }
    const stored = JSON.parse(raw) as Partial<AnswerAsk>;
    if (stored.query !== q) {
      return null;
    }
    if ((stored.reviewIncluded ?? false) !== reviewIncluded) {
      return null;
    }
    return { query: q, mode: parseMode(stored.mode), reviewIncluded };
  } catch {
    /* Unreadable storage or corrupt JSON — degrade to nothing to restore. */
    return null;
  }
}
