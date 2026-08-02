import { Outlet, useMatches } from "react-router";
import { Nav } from "./Nav";

/* One layout-route instance for every child route — per-route config comes
   from the route handle (children can't pass props up to a layout route). */
export interface ShellHandle {
  width?: "wide" | "narrow";
  footer?: boolean;
}

export function Shell() {
  const matches = useMatches();
  const handle = (matches[matches.length - 1]?.handle ?? {}) as ShellHandle;
  const width = handle.width === "narrow" ? "max-w-[1020px]" : "max-w-[1120px]";

  return (
    <div className={`mx-auto px-9 pb-[100px] ${width}`}>
      <header className="bloom flex items-center justify-between py-[26px]">
        <div className="font-display text-[23px] font-semibold">
          Stove<span className="text-accent">.</span>
        </div>
        <Nav />
      </header>
      <Outlet />
      {handle.footer ? (
        <footer className="mt-[70px] text-center text-[13px] text-fg-subtle">
          <b className="font-semibold text-fg-muted">Stove</b> is your private
          shelf · grounded in your own books
        </footer>
      ) : null}
    </div>
  );
}
