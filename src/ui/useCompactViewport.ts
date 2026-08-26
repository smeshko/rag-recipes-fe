import { useSyncExternalStore } from "react";

/**
 * True below the 880px tier, where the rail stops being a column beside the
 * page and becomes an overlay drawer on top of it.
 *
 * The breakpoint used to live purely in the stylesheet, and that was right
 * while the two tiers differed only in PAINT. They no longer do: the rail is
 * collapsible on both, and each tier wants different behaviour from the same
 * collapse — an overlay dims the page, locks its scroll, closes on Escape and
 * closes itself after every destination; a column does none of those. Those
 * are decisions, not classes, so the layout has to know which tier it is on.
 *
 * The query is the negative of the CSS one on purpose: `max-[880px]:` matches
 * at 880 and below, so `(max-width: 880px)` names exactly the same span. Keep
 * the two spellings in step — a rail that thinks it is a column while the
 * stylesheet paints it as a drawer is the one bug this hook can cause.
 *
 * useSyncExternalStore rather than an effect + state: the first paint reads
 * the real width, so a desktop never renders one frame of collapsed rail on
 * the way in.
 */
const COMPACT_QUERY = "(max-width: 880px)";

/* Resolved once and kept: `getSnapshot` runs on every render, and minting a
   fresh MediaQueryList each time would leave the subscription watching a
   different object than the one being read.

   Not every environment has matchMedia — jsdom ships none, and neither do some
   embedded webviews (the same guard themeStore carries). Desktop is the safe
   answer there: a static column degrades to a usable page, a drawer that can
   never be opened does not. */
let list: MediaQueryList | null | undefined;

function mediaList(): MediaQueryList | null {
  if (list === undefined) {
    list =
      typeof window === "undefined" || typeof window.matchMedia !== "function"
        ? null
        : window.matchMedia(COMPACT_QUERY);
  }
  return list;
}

/** Drops the memoised list so a test can install its own `matchMedia`. */
export function resetCompactViewportForTests(): void {
  list = undefined;
}

function subscribe(onChange: () => void): () => void {
  const watched = mediaList();
  if (watched === null) {
    return () => {};
  }
  watched.addEventListener("change", onChange);
  return () => watched.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return mediaList()?.matches ?? false;
}

export function useCompactViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
