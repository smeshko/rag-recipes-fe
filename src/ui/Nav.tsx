import { Link, matchPath, useLocation } from "react-router";
import { lastSearchUrl } from "../features/search/lastSearch";

/* Active state is derived once from pathname — NavLink can't express
   "Cook stays active on /recipes/*" (its root match ignores `end`), so these
   are plain Links with aria-current set by hand on the single active pill. */
type ActivePill = "cook" | "library" | null;

/* matchPath, not string prefixes: it applies the router's own matching, so a
   path only lights a pill up if it really resolves to that route. Prefixes
   claimed /recipes, /recipes-old and /recipes/a/b, all of which are 404s. */
function activePill(pathname: string): ActivePill {
  if (matchPath("/", pathname) || matchPath("/recipes/:id", pathname)) {
    return "cook";
  }
  if (matchPath("/library", pathname)) {
    return "library";
  }
  return null;
}

function pillClass(active: boolean): string {
  return active
    ? "rounded-pill bg-ink px-[18px] py-[9px] text-sm font-semibold text-cream"
    : "rounded-pill px-[18px] py-[9px] text-sm font-semibold text-ink-soft transition-colors hover:bg-apricot-soft hover:text-ink";
}

export function Nav() {
  const { pathname } = useLocation();
  const active = activePill(pathname);

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
