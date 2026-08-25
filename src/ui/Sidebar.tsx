import { Link } from "react-router";
import { IconClose, IconCompose } from "./icons";
/* Imported from the modules, not from `./index`: the barrel exports Shell,
   which imports this file — going through it would close a runtime cycle. */
import { Nav } from "./Nav";
import { ThemeToggle } from "./theme/ThemeToggle";

/* The navigation rail.
 *
 * ONE instance serves both tiers, and that is the whole design of this file.
 * At >=880px it is a static 260px column in the Shell's flex row; below 880 the
 * same element becomes a fixed off-canvas drawer that slides in. Rendering a
 * second copy for mobile would be simpler CSS and a worse component: two <nav>
 * landmarks, every link in the document twice, and `getByRole("navigation")`
 * ambiguous for tests and screen readers alike.
 *
 * Closed-on-mobile is `invisible`, not merely translated off-screen. A
 * transformed element is still in the tab order, so a keyboard user would
 * otherwise Tab straight into a drawer nobody can see. `visibility: hidden`
 * takes it out of the tree for focus and hit-testing in pure CSS, which is why
 * this needs no `inert` and no matchMedia — the breakpoint stays in the
 * stylesheet where the rest of the layout lives. It still transitions: the
 * transform animates and visibility flips discretely at the end.
 *
 * The `open` prop is inert above 880 — the base `visible`/`translate-x-0` win
 * because the drawer classes are all `max-[880px]:`-scoped. */
export interface SidebarProps {
  /** Drawer state. Only observable below the 880px tier. */
  open: boolean;
  /** Dismiss the drawer — the close button, and every nav row. */
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <aside
      /* aria-label rather than a heading: the rail is a complementary landmark
         and its own <nav> child carries the navigation semantics. */
      aria-label="Sidebar"
      /* sticky + h-dvh, not a plain flex child: stretched to the row's height
         the rail would grow with a long page and push its own footer down to
         the bottom of the DOCUMENT. Pinned to the viewport it scrolls
         independently, which is what a rail is for. The mobile arm's `fixed
         inset-y-0` overrides both. */
      className={`sticky top-0 flex h-dvh w-[260px] flex-none flex-col overflow-y-auto border-r border-border bg-surface-sidebar px-3 py-3 max-[880px]:fixed max-[880px]:inset-y-0 max-[880px]:left-0 max-[880px]:z-50 max-[880px]:w-[min(280px,82vw)] max-[880px]:shadow-menu max-[880px]:transition-transform max-[880px]:duration-200 max-[880px]:ease-out ${
        open
          ? "max-[880px]:visible max-[880px]:translate-x-0"
          : "max-[880px]:invisible max-[880px]:-translate-x-full"
      }`}
    >
      {/* Brand row. The close button is drawer-only chrome, so it is absent
          above the tier rather than merely hidden — an offscreen button with
          an accessible name is still something a screen-reader user can find
          and press on a desktop where there is no drawer to close. */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-[15px] font-semibold tracking-[-0.01em]">
          Stove
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
          className="hidden rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg max-[880px]:grid max-[880px]:place-items-center"
        >
          <IconClose className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* The "start fresh" action, above the destinations and outside <nav>.
          Outside on purpose: it is an action, not a place, and keeping the nav
          landmark to exactly the three destinations is what lets a screen
          reader announce "3 items" truthfully.

          It points at bare "/" while the Cook row points at lastSearchUrl(),
          which is the real distinction between them: New search clears the
          query, Cook resumes the last one. */}
      <Link
        to="/"
        onClick={onClose}
        className="mt-1 mb-1 flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[14px] font-medium text-fg transition-colors hover:bg-surface-hover pointer-coarse:min-h-11"
      >
        <IconCompose className="h-[18px] w-[18px] flex-none" />
        New search
      </Link>

      <Nav onNavigate={onClose} />

      {/* mt-auto pins the footer to the bottom of the rail at any height.

          The label is "Appearance", not the app's "grounded in your own books"
          tagline: the rail renders on EVERY route, and the tagline is also the
          Cook page's footer, so putting it here would print the same sentence
          twice on one screen — and would break the two route tests that assert
          the footer is absent by searching the document for that phrase. */}
      <div className="mt-auto flex items-center justify-between gap-2 px-1 pt-4">
        <span className="text-[12px] text-fg-subtle">Appearance</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
