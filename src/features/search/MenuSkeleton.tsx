/** Menu-shaped placeholder; same geometry as MenuCard so the swap doesn't
    jump, same flat blocks as AnswerSkeleton (no pulse — see the note there).
    Four course rows: the planner's usual count. */
export function MenuSkeleton() {
  return (
    <section
      data-testid="menu-skeleton"
      aria-hidden="true"
      className="mt-10 max-[560px]:mt-7"
    >
      {/* Meta line, then the menu title, then the coherence prose. */}
      <div className="h-4 w-64 rounded-reco bg-skeleton" />
      <div className="mt-2 h-6 w-3/5 rounded-reco bg-skeleton" />
      <div className="mt-4 space-y-3">
        <div className="h-4 w-full rounded-reco bg-skeleton" />
        <div className="h-4 w-11/12 rounded-reco bg-skeleton" />
        <div className="h-4 w-4/5 rounded-reco bg-skeleton" />
      </div>
      <div className="mt-8">
        <div className="h-4 w-28 rounded-reco bg-skeleton" />
        <div className="mt-3 space-y-2">
          <div className="h-14 rounded-[10px] bg-skeleton" />
          <div className="h-14 rounded-[10px] bg-skeleton" />
          <div className="h-14 rounded-[10px] bg-skeleton" />
          <div className="h-14 rounded-[10px] bg-skeleton" />
        </div>
      </div>
    </section>
  );
}
