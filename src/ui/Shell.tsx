import { Outlet, useMatches } from "react-router";
import { Nav } from "./Nav";
/* Imported from the module, not from `./index`, for the same reason Nav is:
   the barrel exports Shell, so going through it would close a runtime cycle. */
import { ThemeToggle } from "./theme/ThemeToggle";

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

  /* Gutters are the phone tier's single highest-leverage change: 36px a side
     costs 72px of a 375px viewport, leaving 303px of content. 20px gives that
     back as 335px. See theme.css for the three-tier scale. */
  return (
    <div
      className={`mx-auto px-9 pb-[100px] max-[560px]:px-5 max-[560px]:pb-16 ${width}`}
    >
      {/* flex-wrap is a safety net, not the intended look. Once the nav pills
          and the three theme segments grow to their 44px touch floor, the bar
          measures ~374px against a 335px box at 375px — it overflowed before
          this. Trimmed pill padding brings it back under, and the wrap means a
          longer nav or a fourth segment degrades to a second line instead of
          pushing the whole page sideways. */}
      <header className="bloom flex items-center justify-between py-[26px] max-[560px]:flex-wrap max-[560px]:gap-y-2 max-[560px]:py-4">
        <div className="font-display text-[23px] font-semibold">
          Stove<span className="text-accent">.</span>
        </div>
        <div className="flex items-center gap-3 max-[560px]:gap-1.5">
          <Nav />
          <ThemeToggle />
        </div>
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
