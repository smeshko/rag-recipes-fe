import { Link, matchPath, useLocation } from "react-router";
import { lastSearchUrl } from "../features/search/lastSearch";
/* Imported from the module, not from `./index`: the barrel exports Shell,
   which imports Nav — going through it would close a runtime cycle. */
import { readReturnTo, returnSection } from "./returnTo";

/* Active state is derived once from the location — NavLink can't express
   "Cook stays active on /recipes/*" (its root match ignores `end`), so these
   are plain Links with aria-current set by hand on the single active pill. */
type ActivePill = "cook" | "library" | null;

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
  if (
    matchPath("/library", pathname) ||
    matchPath({ path: "/review", end: false }, pathname)
  ) {
    return "library";
  }
  if (matchPath("/recipes/:id", pathname)) {
    const section = returnSection(readReturnTo(new URLSearchParams(search)));
    return section === "library" || section === "review" ? "library" : "cook";
  }
  if (matchPath("/", pathname)) {
    return "cook";
  }
  return null;
}

function pillClass(active: boolean): string {
  return active
    ? "rounded-pill bg-ink px-[18px] py-[9px] text-sm font-semibold text-cream"
    : "rounded-pill px-[18px] py-[9px] text-sm font-semibold text-ink-soft transition-colors hover:bg-apricot-soft hover:text-ink";
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
