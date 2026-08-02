import { isInternalPath } from "../../ui/returnTo";

/**
 * The last committed search, remembered as the URL that `writeParams` already
 * built — not a record to re-derive one from. Whatever `searchUrl` produced is
 * what the Cook pill points at, so there is no second copy of the hybrid,
 * `asked` or review rules to drift out of step with `searchUrl.ts`.
 *
 * sessionStorage rather than a router-carried value by design: the pill has to
 * restore the search from *anywhere* — the library, the review queue, a recipe
 * reached from a bookmark — not only after a detour that could have carried
 * the URL along. "Which search is this tab in the middle of" is genuinely
 * per-tab state, and a fresh tab starting blank is the right answer.
 *
 * Imported from `../../ui/returnTo` directly, never the `../../ui` barrel: the
 * barrel exports Shell → Nav → this module, so the barrel form would close a
 * runtime import cycle.
 */
export const LAST_SEARCH_KEY = "sk:last-search";

/* Every storage access is guarded: sessionStorage can throw (private
   windows, storage disabled), and remembering a search is never worth an
   error — a failure degrades to the blank slate. */

export function saveLastSearch(url: string): void {
  try {
    sessionStorage.setItem(LAST_SEARCH_KEY, url);
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
 * Where the Cook pill should point: the stored URL, or the bare `/` when
 * nothing is stored. `isInternalPath` is cheap insurance rather than paranoia
 * about our own writer — the key is editable from devtools and its value goes
 * straight into an `href`, where `//evil.com` is an open redirect, so the same
 * "safe to hand to `<Link to>`" rule the `?from=` contract applies is applied
 * here too, from the one module that spells it.
 */
export function lastSearchUrl(): string {
  try {
    const stored = sessionStorage.getItem(LAST_SEARCH_KEY);
    if (stored === null || !isInternalPath(stored)) {
      return "/";
    }
    return stored;
  } catch {
    /* Unreadable storage — degrade to the blank slate. */
    return "/";
  }
}
