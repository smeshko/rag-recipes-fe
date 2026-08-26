import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useMatches } from "react-router";
import { IconSidebar } from "./icons";
import { Sidebar } from "./Sidebar";
/* Imported from the modules, not from `./index`, for the same reason Nav is:
   the barrel exports Shell, so going through it would close a runtime cycle. */
import {
  readSidebarPreference,
  writeSidebarPreference,
} from "./sidebarPreference";
import { useCompactViewport } from "./useCompactViewport";

/* One layout-route instance for every child route — per-route config comes
   from the route handle (children can't pass props up to a layout route). */
export interface ShellHandle {
  width?: "wide" | "narrow";
  footer?: boolean;
}

/* The reading measure, widened once after seeing it in use: 768/900 was the
   target's PROSE column, and this app is not only prose. The recipe surface is
   two columns of list, the shelf is rows, and the search results are a
   three-column grid — all of which were being squeezed into a measure sized
   for paragraphs. The target's own main pane measures 1180px; `wide` now sits
   just under that, and `narrow` keeps the two-column recipe honest without
   letting a single ingredient line run to 1100px.

   The composer is unaffected: it caps itself at 768 inside whatever column it
   is given, which is the one place the prose measure is still the right one. */
const WIDTH: Record<"wide" | "narrow", string> = {
  wide: "max-w-[1160px]",
  narrow: "max-w-[880px]",
};

export function Shell() {
  const matches = useMatches();
  const location = useLocation();
  const handle = (matches[matches.length - 1]?.handle ?? {}) as ShellHandle;

  /* ONE piece of state for a rail that means two things. Above the tier `open`
     is "the column is expanded", a standing preference that survives reloads;
     at or below it, "the drawer is slid in", which always starts closed and is
     never remembered. Crossing the tier re-reads the right answer for the side
     you land on, which is also what keeps a resize honest: shrink a desktop
     and you do not get an overlay you never asked for. */
  const compact = useCompactViewport();
  const [open, setOpen] = useState(() => !compact && readSidebarPreference());

  useEffect(
    () => setOpen(compact ? false : readSidebarPreference()),
    [compact],
  );

  /* Only the column's state is worth remembering — see sidebarPreference. */
  const setOpenAndRemember = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!compact) {
        writeSidebarPreference(next);
      }
    },
    [compact],
  );
  const closeSidebar = useCallback(
    () => setOpenAndRemember(false),
    [setOpenAndRemember],
  );

  /* A drawer covers the page it navigated away from, so it has to dismiss
     itself; a column does not, and collapsing one on every click would be a
     rail that fights the reader.

     location.key, not pathname: a re-navigation to the same URL (the Cook row
     while already on a search) still mints a new key, and the drawer should
     close for that too. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key IS the dependency — closing is the effect of navigating, not of the callback identity.
  useEffect(() => {
    if (compact) {
      setOpen(false);
    }
  }, [location.key, compact]);

  /* The three behaviours below belong to the OVERLAY, not to the rail: they
     all exist because a drawer sits on top of a page that is still there.
     A collapsed column dims nothing, locks nothing, and traps nothing. */
  const overlaid = compact && open;

  /* Escape closes the drawer. Bound only while it is open so the app has no
     standing keydown listener, and on `document` so it fires wherever focus
     sits — including the backdrop, which is not focusable. */
  useEffect(() => {
    if (!overlaid) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [overlaid]);

  /* Scroll lock, restoring whatever was there rather than assuming "". The
     drawer overlays a page that is still scrollable behind it otherwise, and
     on iOS a background scroll under a fixed panel is genuinely disorienting. */
  useEffect(() => {
    if (!overlaid) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [overlaid]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar open={open} compact={compact} onClose={closeSidebar} />

      {/* Mouse-only convenience, hidden from the a11y tree: Escape and the
          rail's own "Close sidebar" button are the accessible affordances, and
          a second button with that name would be a duplicate to anyone
          navigating by landmark or by button list. */}
      {overlaid ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-black/40"
        />
      ) : null}

      {/* min-w-0 is load-bearing: a flex child defaults to min-width:auto, so
          one long unbroken string inside the content column would widen this
          track and push the rail off-screen instead of wrapping. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The bar exists to carry what a hidden rail was carrying: the way
            back into it, and the wordmark. An expanded column already holds
            both, so on that layout there is no bar at all rather than an empty
            strip — which is exactly the target's behaviour, where collapsing
            the sidebar is what makes its toggle appear over the content. */}
        {compact || !open ? (
          <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-border bg-surface px-2 py-2">
            <button
              type="button"
              onClick={() => setOpenAndRemember(true)}
              aria-label="Open sidebar"
              aria-expanded={open}
              className="grid place-items-center rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              <IconSidebar className="h-[19px] w-[19px]" />
            </button>
            <Link
              to="/"
              className="rounded-lg px-1.5 py-1 text-[15px] font-semibold tracking-[-0.01em] transition-colors hover:bg-surface-hover"
            >
              Stove
            </Link>
          </header>
        ) : null}

        <main className="flex-1">
          <div
            className={`mx-auto w-full px-6 pt-8 pb-16 max-[560px]:px-4 max-[560px]:pt-5 max-[560px]:pb-10 ${
              WIDTH[handle.width === "wide" ? "wide" : "narrow"]
            }`}
          >
            <Outlet />
            {handle.footer ? (
              <footer className="mt-16 text-center text-[12.5px] text-fg-subtle">
                Stove is your private shelf · grounded in your own books
              </footer>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
