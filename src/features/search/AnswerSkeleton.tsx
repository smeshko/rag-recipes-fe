import { Bloom } from "../../ui";

/** Answer-card-shaped placeholder. Flat grey blocks, no pulse: the point is to
    hold the answer card's geometry so the pending→loaded swap doesn't jump,
    and a shimmering box draws more attention than the content it stands in
    for. The one moving thing in this language is progress, and this is not
    progress — it is a shape waiting to be filled. */
export function AnswerSkeleton() {
  return (
    <Bloom duration={0.7} delay={0.2} className="mt-14">
      <div
        data-testid="answer-skeleton"
        aria-hidden="true"
        className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] overflow-hidden rounded-panel border border-border bg-surface-raised max-[960px]:grid-cols-1"
      >
        {/* Tracks AnswerCard's prose column at every tier — the skeleton
            exists to make the pending→loaded swap not jump, so a padding
            change there that is not mirrored here defeats the component. */}
        <div className="p-9 max-[560px]:px-5 max-[560px]:py-6">
          {/* Stands in for the Eyebrow, which is now small caps text rather
              than a filled accent pill — so is this. */}
          <div className="h-4 w-56 rounded-reco bg-skeleton" />
          <div className="mt-5 space-y-3">
            <div className="h-4 w-full rounded-reco bg-skeleton" />
            <div className="h-4 w-11/12 rounded-reco bg-skeleton" />
            <div className="h-4 w-4/5 rounded-reco bg-skeleton" />
            <div className="mt-6 h-4 w-full rounded-reco bg-skeleton" />
            <div className="h-4 w-3/4 rounded-reco bg-skeleton" />
          </div>
        </div>
        {/* The picks aside, inset fill and all, so the column does not change
            colour underneath the reader when the answer lands. */}
        <div className="space-y-3 border-l border-border bg-surface-inset p-7 max-[960px]:border-t max-[960px]:border-l-0 max-[560px]:p-5">
          <div className="h-3 w-28 rounded-reco bg-skeleton" />
          <div className="h-16 rounded-reco bg-skeleton" />
          <div className="h-16 rounded-reco bg-skeleton" />
          <div className="h-16 rounded-reco bg-skeleton" />
        </div>
      </div>
    </Bloom>
  );
}
