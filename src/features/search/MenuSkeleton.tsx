import { Bloom } from "../../ui";

/** Menu-card-shaped shimmer; same geometry as MenuCard so the swap doesn't
    jump. Four course rows: the planner's usual count. */
export function MenuSkeleton() {
  return (
    <Bloom duration={0.7} delay={0.2} className="mt-14">
      <div
        data-testid="menu-skeleton"
        aria-hidden="true"
        className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] overflow-hidden rounded-[22px] border border-border bg-surface-raised shadow-card max-[960px]:grid-cols-1"
      >
        <div className="p-9 max-[560px]:px-5 max-[560px]:py-6">
          <div className="h-7 w-64 animate-pulse rounded-pill bg-accent-fill" />
          <div className="mt-5 h-8 w-3/4 animate-pulse rounded bg-skeleton/60" />
          <div className="mt-5 space-y-3">
            <div className="h-4 w-full animate-pulse rounded bg-skeleton/60" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-skeleton/50" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-skeleton/40" />
          </div>
        </div>
        <div className="space-y-3 border-l border-border p-7 max-[960px]:border-t max-[960px]:border-l-0 max-[560px]:p-5">
          <div className="h-3 w-28 animate-pulse rounded bg-skeleton/50" />
          <div className="h-16 animate-pulse rounded-[14px] bg-skeleton/40" />
          <div className="h-16 animate-pulse rounded-[14px] bg-skeleton/30" />
          <div className="h-16 animate-pulse rounded-[14px] bg-skeleton/20" />
          <div className="h-16 animate-pulse rounded-[14px] bg-skeleton/15" />
        </div>
      </div>
    </Bloom>
  );
}
