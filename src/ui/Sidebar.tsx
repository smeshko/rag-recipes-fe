import { Link } from "react-router";
import { IconSidebar } from "./icons";
/* Imported from the modules, not from `./index`: the barrel exports Shell,
   which imports this file — going through it would close a runtime cycle. */
import { Nav } from "./Nav";
import { ThemeToggle } from "./theme/ThemeToggle";

/* The navigation rail.
 *
 * ONE instance serves both tiers, and that is the whole design of this file.
 * At >880px it is a column in the Shell's flex row that collapses to zero
 * width; at 880 and below the same element is a fixed off-canvas drawer that
 * slides in over the page. Rendering a second copy for mobile would be simpler
 * markup and a worse component: two <nav> landmarks, every link in the
 * document twice, and `getByRole("navigation")` ambiguous for tests and screen
 * readers alike.
 *
 * The two tiers are told apart in JS now rather than by `max-[880px]:` classes
 * alone (see useCompactViewport for why): collapsing a column and opening a
 * drawer are the same intent but not the same behaviour, and one class string
 * carrying both arms had stopped being readable.
 *
 * Closed is `invisible`, not merely zero-width or translated off-screen. A
 * clipped or transformed element is still in the tab order, so a keyboard user
 * would otherwise Tab into a rail nobody can see. `visibility: hidden` takes it
 * out of the tree for focus and hit-testing without `inert` and without a
 * second state to track. It still animates: visibility is listed in the
 * transition, which holds it `visible` for the whole of the closing tween and
 * flips it the moment an opening one starts. */
export interface SidebarProps {
  /** Expanded, as a column; slid in, as a drawer. */
  open: boolean;
  /** At/below 880px, where the rail is an overlay rather than a column. */
  compact: boolean;
  /** Collapse it: the rail's own toggle, and — when compact — every nav row. */
  onClose: () => void;
}

/* Fixed on the inner panel, never a percentage: the outer frame animates its
   own width to zero, and content measured against THAT would reflow every
   frame of the collapse instead of sliding out behind the clip. */
const PANEL = "w-[260px]";

export function Sidebar({ open, compact, onClose }: SidebarProps) {
  /* A drawer is dismissed by going somewhere; a column has no reason to close
     just because the page behind it changed. */
  const dismiss = compact ? onClose : undefined;

  const frame = compact
    ? `fixed inset-y-0 left-0 z-50 w-[min(280px,82vw)] shadow-menu transition-[transform,visibility] ${
        open ? "visible translate-x-0" : "invisible -translate-x-full"
      }`
    : /* sticky + h-dvh, not a plain flex child: stretched to the row's height
         the rail would grow with a long page and push its own footer down to
         the bottom of the DOCUMENT. Pinned to the viewport it scrolls
         independently, which is what a rail is for. */
      `sticky top-0 h-dvh flex-none transition-[width,visibility] ${
        open ? `visible ${PANEL}` : "invisible w-0"
      }`;

  return (
    <aside
      /* aria-label rather than a heading: the rail is a complementary landmark
         and its own <nav> child carries the navigation semantics. */
      aria-label="Sidebar"
      className={`overflow-hidden duration-200 ease-out ${frame}`}
    >
      {/* The panel proper. It carries the border and the fill so that both
          leave with it — a 1px rule left behind by a zero-width frame reads as
          a rendering artefact, not as a closed rail. */}
      <div
        className={`flex h-full flex-col overflow-y-auto border-r border-border bg-surface-sidebar px-3 py-3 ${
          compact ? "w-full" : PANEL
        }`}
      >
        {/* Brand row. The wordmark is a link home, which is the one navigation
            convention every site on the web already taught the reader — and it
            is what let the old "New search" row go: a clean composer is the
            brand, a resumed one is the Cook row below it.

            The toggle is the SAME panel glyph the collapsed layout offers to
            reopen with, not an X: this rail sits beside the page rather than
            over it, and an X says "dismiss this thing on top of you". */}
        <div className="flex items-center justify-between gap-2 px-1 py-1.5">
          <Link
            to="/"
            onClick={dismiss}
            className="rounded-lg px-1.5 py-1 text-[15px] font-semibold tracking-[-0.01em] text-fg transition-colors hover:bg-surface-hover"
          >
            Stove
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            aria-expanded={open}
            className="grid place-items-center rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            <IconSidebar className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="mt-1">
          <Nav onNavigate={dismiss} />
        </div>

        {/* mt-auto pins the footer to the bottom of the rail at any height.

            The label is "Appearance", not the app's "grounded in your own
            books" tagline: the rail renders on EVERY route, and the tagline is
            also the Cook page's footer, so putting it here would print the
            same sentence twice on one screen — and would break the two route
            tests that assert the footer is absent by searching the document
            for that phrase. */}
        <div className="mt-auto flex items-center justify-between gap-2 px-1 pt-4">
          <span className="text-[12px] text-fg-subtle">Appearance</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
