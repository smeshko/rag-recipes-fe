import type { SearchMode } from "../../api/search";
import { REVIEW_QUEUE_SEARCH_URL } from "../library/presentation";

/**
 * The last committed search, remembered so the Cook pill can restore it after
 * a detour through another screen. sessionStorage by design: per-tab, gone
 * when the tab closes — a fresh session starts blank (plan decision D2).
 */
export const LAST_SEARCH_KEY = "sk:last-search";

interface LastSearch {
  q: string;
  mode: SearchMode;
  reviewIncluded: boolean;
}

/* Every storage access is guarded: sessionStorage can throw (private
   windows, storage disabled), and remembering a search is never worth an
   error — a failure degrades to the blank slate. */

export function saveLastSearch(
  q: string,
  mode: SearchMode,
  reviewIncluded: boolean,
): void {
  try {
    const entry: LastSearch = { q, mode, reviewIncluded };
    sessionStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(entry));
  } catch {
    /* Storage unavailable — the Cook pill will simply point at "/". */
  }
}

export function clearLastSearch(): void {
  try {
    sessionStorage.removeItem(LAST_SEARCH_KEY);
  } catch {
    /* Nothing to clear if storage never worked. */
  }
}

/**
 * Where the Cook pill should point: `/?q=…[&mode=…][&review=included]`
 * mirroring `writeParams`' URL rules (hybrid stays out of the URL), or bare
 * `/` when nothing is stored. The review param is copied verbatim from
 * `REVIEW_QUEUE_SEARCH_URL` so its spelling lives once, beside its reader
 * (`isReviewIncluded`) in the library's presentation module.
 */
export function lastSearchUrl(): string {
  try {
    const raw = sessionStorage.getItem(LAST_SEARCH_KEY);
    if (raw === null) {
      return "/";
    }
    const stored = JSON.parse(raw) as Partial<LastSearch>;
    if (typeof stored.q !== "string" || stored.q === "") {
      return "/";
    }
    const params = new URLSearchParams();
    params.set("q", stored.q);
    if (stored.mode !== undefined && stored.mode !== "hybrid") {
      params.set("mode", stored.mode);
    }
    if (stored.reviewIncluded === true) {
      for (const [key, value] of new URLSearchParams(
        REVIEW_QUEUE_SEARCH_URL.split("?")[1],
      )) {
        params.set(key, value);
      }
    }
    return `/?${params.toString()}`;
  } catch {
    /* Unreadable storage or corrupt JSON — degrade to the blank slate. */
    return "/";
  }
}
