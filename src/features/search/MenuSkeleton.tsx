import { Bloom } from "../../ui";

/** Menu-card-shaped placeholder; same geometry as MenuCard so the swap doesn't
    jump, same flat blocks as AnswerSkeleton (no pulse — see the note there).
    Four course rows: the planner's usual count. */
export function MenuSkeleton() {
  return (
    <Bloom duration={0.7} delay={0.2} className="mt-14">
      <div
        data-testid="menu-skeleton"
        aria-hidden="true"
        className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] overflow-hidden rounded-panel border border-border bg-surface-raised max-[960px]:grid-cols-1"
      >
        <div className="p-9 max-[560px]:px-5 max-[560px]:py-6">
          <div className="h-4 w-64 rounded-reco bg-skeleton" />
          <div className="mt-5 h-6 w-3/4 rounded-reco bg-skeleton" />
          <div className="mt-5 space-y-3">
            <div className="h-4 w-full rounded-reco bg-skeleton" />
            <div className="h-4 w-11/12 rounded-reco bg-skeleton" />
            <div className="h-4 w-4/5 rounded-reco bg-skeleton" />
          </div>
        </div>
        <div className="space-y-3 border-l border-border bg-surface-inset p-7 max-[960px]:border-t max-[960px]:border-l-0 max-[560px]:p-5">
          <div className="h-3 w-28 rounded-reco bg-skeleton" />
          <div className="h-16 rounded-reco bg-skeleton" />
          <div className="h-16 rounded-reco bg-skeleton" />
          <div className="h-16 rounded-reco bg-skeleton" />
          <div className="h-16 rounded-reco bg-skeleton" />
        </div>
      </div>
    </Bloom>
  );
}
