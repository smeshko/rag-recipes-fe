import { Link, useLocation } from "react-router";

/* Active state is derived once from pathname — NavLink can't express
   "Cook stays active on /recipes/*" (its root match ignores `end`), so these
   are plain Links with aria-current set by hand on the single active pill. */
type ActivePill = "cook" | "library" | null;

function activePill(pathname: string): ActivePill {
  if (pathname === "/" || pathname.startsWith("/recipes")) {
    return "cook";
  }
  if (pathname === "/library") {
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
      <Link
        to="/"
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
      {/* Action affordance, never active — epic 03 points it at the dropzone. */}
      <Link to="/library" className={pillClass(false)}>
        Add books
      </Link>
    </nav>
  );
}
