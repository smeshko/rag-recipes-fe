/** Answer-shaped placeholder. Flat grey blocks, no pulse: the point is to hold
    the answer's geometry so the pending→loaded swap doesn't jump, and a
    shimmering box draws more attention than the content it stands in for. The
    one moving thing in this language is progress, and this is not progress —
    it is a shape waiting to be filled.

    Tracks AnswerCard EXACTLY, and that is the whole contract of this file: a
    bordered two-column card here against inline prose there is not a cosmetic
    mismatch, it is a visible jump at the moment the reader's attention is on
    the page. (It was exactly that for one commit — the card was flattened and
    this was not. Caught in the browser, not by a test, because no test asserts
    that two components agree about shape.) So: same mt-10, same meta line,
    same prose column, same borderless picks list, no border and no fill. */
export function AnswerSkeleton() {
  return (
    <section
      data-testid="answer-skeleton"
      aria-hidden="true"
      className="mt-10 max-[560px]:mt-7"
    >
      {/* The "Grounded in your books · N citations" meta line. */}
      <div className="h-4 w-56 rounded-reco bg-skeleton" />
      <div className="mt-3 space-y-3">
        <div className="h-4 w-full rounded-reco bg-skeleton" />
        <div className="h-4 w-11/12 rounded-reco bg-skeleton" />
        <div className="h-4 w-4/5 rounded-reco bg-skeleton" />
        <div className="mt-6 h-4 w-full rounded-reco bg-skeleton" />
        <div className="h-4 w-3/4 rounded-reco bg-skeleton" />
      </div>
      {/* "Tonight's picks" and its rows — rows, not cards, matching the list
          AnswerCard renders. */}
      <div className="mt-8">
        <div className="h-4 w-28 rounded-reco bg-skeleton" />
        <div className="mt-3 space-y-2">
          <div className="h-12 rounded-[10px] bg-skeleton" />
          <div className="h-12 rounded-[10px] bg-skeleton" />
          <div className="h-12 rounded-[10px] bg-skeleton" />
        </div>
      </div>
    </section>
  );
}
