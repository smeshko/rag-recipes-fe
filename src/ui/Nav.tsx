import type { ReactElement } from "react";
import { Link, matchPath, useLocation } from "react-router";
import { lastSearchUrl } from "../features/search/lastSearch";
import { IconLibrary, IconSearch, IconStar } from "./icons";
/* Imported from the module, not from `./index`: the barrel exports Shell,
   which imports Nav — going through it would close a runtime cycle. */
import { readReturnTo, returnSection } from "./returnTo";

/* Active state is derived once from the location — NavLink can't express
   "Cook stays active on /recipes/*" (its root match ignores `end`), so these
   are plain Links with aria-current set by hand on the single active row.

   The name `ActivePill` predates the sidebar and is kept deliberately: the
   whole active-state contract below is what tests/shell.test.tsx pins, and
   renaming it while re-skinning would make that diff read as a behaviour
   change when nothing about the matching moved. Only the CHROME changed —
   three pills in a top bar became three rows in a rail. */
type ActivePill = "cook" | "favourites" | "library" | null;

/* matchPath, not string prefixes: it applies the router's own matching, so a
   path only lights a row up if it really resolves to that route. Prefixes
   claimed /recipes, /recipes-old and /recipes/a/b, all of which are 404s.

   The recipe leaf is derived rather than pinned: /recipes/:id is shared by
   every section, so the row comes from the ?from= return target — a recipe
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
     silently stop lighting the row. */
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

/* The rail row. `inline-flex items-center` is load-bearing, not decoration:
   min-height has no effect on an inline box, and these are <Link>s.
   `pointer-coarse:min-h-11` is the 44px touch floor — keyed to the POINTER,
   not to a width, so a landscape phone at 667px gets it too (theme.css's
   breakpoint note), and so the drawer's rows are thumb-sized without the rail
   growing on a desktop with a mouse.

   Active is a grey FILL, not the inverted black one. The black solid is
   reserved for the primary action (send, save, upload) — spending it on a nav
   row would leave the actual buttons with nothing louder to be. */
const ROW_BASE =
  "flex w-full items-center gap-1.5 rounded-[10px] px-2.5 py-[7px] text-[14px] transition-colors pointer-coarse:min-h-11";

function rowClass(active: boolean): string {
  return active
    ? `${ROW_BASE} bg-surface-hover text-fg`
    : `${ROW_BASE} text-fg-muted hover:bg-surface-hover hover:text-fg`;
}

interface Destination {
  readonly key: Exclude<ActivePill, null>;
  readonly label: string;
  readonly Icon: (props: { className?: string }) => ReactElement;
  /** Static path, or a function for Cook's "resume the last search" target. */
  readonly to: string | (() => string);
}

const DESTINATIONS: readonly Destination[] = [
  /* The Cook row restores the last committed search (sessionStorage). Nav
     re-renders on every location change (useLocation below), so the read stays
     fresh without a subscription.

     Cook resumes, the wordmark above it starts fresh. That pairing is what
     replaced the old "New search" row: two rail entries both spelled as places
     said nothing about which one cleared the box, where a brand that goes home
     is a convention the reader already has. */
  { key: "cook", label: "Cook", Icon: IconSearch, to: lastSearchUrl },
  /* Between Cook and Library because that is the reading order of the app:
     find something, keep it, then curate the shelf it came from. */
  { key: "favourites", label: "Favourites", Icon: IconStar, to: "/favourites" },
  { key: "library", label: "Library", Icon: IconLibrary, to: "/library" },
];

export interface NavProps {
  /** Fired after a row is followed — the drawer uses it to close itself. */
  onNavigate?: () => void;
}

export function Nav({ onNavigate }: NavProps) {
  const location = useLocation();
  const active = activePill(location);

  return (
    <nav className="flex flex-col gap-0.5">
      {DESTINATIONS.map(({ key, label, Icon, to }) => (
        <Link
          key={key}
          to={typeof to === "function" ? to() : to}
          onClick={onNavigate}
          className={rowClass(active === key)}
          aria-current={active === key ? "page" : undefined}
        >
          <Icon className="h-[18px] w-[18px] flex-none" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
