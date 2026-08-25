import { Link, matchPath, useLocation } from "react-router";
import { lastSearchUrl } from "../features/search/lastSearch";
/* Imported from the module, not from `./index`: the barrel exports Shell,
   which imports Nav — going through it would close a runtime cycle. */
import { readReturnTo, returnSection } from "./returnTo";

/* Active state is derived once from the location — NavLink can't express
   "Cook stays active on /recipes/*" (its root match ignores `end`), so these
   are plain Links with aria-current set by hand on the single active pill. */
type ActivePill = "cook" | "favourites" | "library" | null;

/* matchPath, not string prefixes: it applies the router's own matching, so a
   path only lights a pill up if it really resolves to that route. Prefixes
   claimed /recipes, /recipes-old and /recipes/a/b, all of which are 404s.

   The recipe leaf is derived rather than pinned: /recipes/:id is shared by
   every section, so the pill comes from the ?from= return target — a recipe
   opened from the shelf or the queue keeps Library lit. No target, or a
   rejected one, degrades identically to Cook. */
function activePill({
  pathname,
  search,
}: {
  pathname: string;
  search: string;
}): ActivePill {
  /* end: false, like returnSection's own arm: a future /review/:id must not
     silently stop lighting the pill. */
  if (matchPath("/favourites", pathname)) {
    return "favourites";
  }
  if (
    matchPath("/library", pathname) ||
    matchPath({ path: "/review", end: false }, pathname)
  ) {
    return "library";
  }
  if (matchPath("/recipes/:id", pathname)) {
    const section = returnSection(readReturnTo(new URLSearchParams(search)));
    if (section === "favourites") {
      return "favourites";
    }
    return section === "library" || section === "review" ? "library" : "cook";
  }
  if (matchPath("/", pathname)) {
    return "cook";
  }
  return null;
}

/* `inline-flex items-center` is load-bearing, not decoration: min-height has
   no effect on an inline box, and these are <Link>s. `pointer-coarse:min-h-11`
   is the 44px touch floor — keyed to the POINTER, not to a width, so a
   landscape phone at 667px gets it too (theme.css's breakpoint note). */
const PILL_BASE =
  "inline-flex items-center rounded-pill px-[18px] py-[9px] text-sm font-semibold max-[560px]:px-3 pointer-coarse:min-h-11";

function pillClass(active: boolean): string {
  return active
    ? `${PILL_BASE} bg-surface-inverted text-fg-inverted`
    : `${PILL_BASE} text-fg-muted transition-colors hover:bg-accent-fill hover:text-fg`;
}

export function Nav() {
  const location = useLocation();
  const active = activePill(location);

  return (
    <nav className="flex gap-1.5">
      {/* The Cook pill restores the last committed search (sessionStorage).
          Nav re-renders on every location change (useLocation above), so the
          read stays fresh without a subscription. */}
      <Link
        to={lastSearchUrl()}
        className={pillClass(active === "cook")}
        aria-current={active === "cook" ? "page" : undefined}
      >
        Cook
      </Link>
      {/* Between Cook and Library because that is the reading order of the
          app: find something, keep it, then curate the shelf it came from.

          A third pill is what the Shell header's flex-wrap note anticipated —
          at 375px the bar now wraps to a second line rather than pushing the
          page sideways, which is the designed degrade, not a regression. */}
      <Link
        to="/favourites"
        className={pillClass(active === "favourites")}
        aria-current={active === "favourites" ? "page" : undefined}
      >
        Favourites
      </Link>
      <Link
        to="/library"
        className={pillClass(active === "library")}
        aria-current={active === "library" ? "page" : undefined}
      >
        Library
      </Link>
    </nav>
  );
}
