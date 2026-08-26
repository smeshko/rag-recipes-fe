import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useMatches } from "react-router";
import { IconCompose, IconSidebar } from "./icons";
/* Imported from the module, not from `./index`, for the same reason Nav is:
   the barrel exports Shell, so going through it would close a runtime cycle. */
import { Sidebar } from "./Sidebar";

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

  /* Drawer state is observable only below the 880px tier — above it the
     Sidebar's drawer classes don't apply and the rail is simply always there.
     That is what makes the resize case free: open the drawer at 500px, widen
     to 1200px, and both the rail and the backdrop revert to their desktop
     rendering with no listener and no state to reconcile. */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  /* location.key, not pathname: a re-navigation to the same URL (the Cook row
     while already on a search) still mints a new key, and the drawer should
     close for that too. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key IS the dependency — closing is the effect of navigating, not of the callback identity.
  useEffect(() => setDrawerOpen(false), [location.key]);

  /* Escape closes the drawer. Bound only while it is open so the app has no
     standing keydown listener, and on `document` so it fires wherever focus
     sits — including the backdrop, which is not focusable. */
  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  /* Scroll lock, restoring whatever was there rather than assuming "". The
     drawer overlays a page that is still scrollable behind it otherwise, and
     on iOS a background scroll under a fixed panel is genuinely disorienting.
     Above 880 this is a no-op because nothing can set drawerOpen there. */
  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar open={drawerOpen} onClose={closeDrawer} />

      {/* Mouse-only convenience, hidden from the a11y tree: Escape and the
          rail's own "Close sidebar" button are the accessible affordances, and
          a second button with that name would be a duplicate to anyone
          navigating by landmark or by button list. `hidden max-[880px]:block`
          rather than a JS width check — it must disappear on resize even
          though drawerOpen is still true. */}
      {drawerOpen ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={closeDrawer}
          className="fixed inset-0 z-40 hidden bg-black/40 max-[880px]:block"
        />
      ) : null}

      {/* min-w-0 is load-bearing: a flex child defaults to min-width:auto, so
          one long unbroken string inside the content column would widen this
          track and push the rail off-screen instead of wrapping. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Drawer chrome — the only reason a top bar exists at all. Above 880
            the rail carries the brand and every destination, so the bar would
            be an empty strip. `hidden max-[880px]:flex`, so it is present in
            the DOM (and in tests) but painted only below the tier. */}
        <header className="sticky top-0 z-30 hidden items-center gap-1 border-b border-border bg-surface px-2 py-2 max-[880px]:flex">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open sidebar"
            aria-expanded={drawerOpen}
            className="grid place-items-center rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            <IconSidebar className="h-[19px] w-[19px]" />
          </button>
          <span className="flex-1 text-[15px] font-semibold tracking-[-0.01em]">
            Stove
          </span>
          <Link
            to="/"
            aria-label="New search"
            className="grid place-items-center rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            <IconCompose className="h-[19px] w-[19px]" />
          </Link>
        </header>

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
