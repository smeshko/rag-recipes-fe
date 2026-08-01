import { Bloom } from "../../ui";

/* Discoverability strip (round-1 #4): after a plain search the grounded
   answer is one click away, but nothing between the bar and the grid says
   so. A quiet card strip — deliberately not primary-styled, the bar's Ask
   keeps that role — offers it, and vanishes the moment the answer slot is
   occupied (the parent owns that predicate). Blooms in with the grid. */
export function AnswerCta({ onAsk }: { onAsk: () => void }) {
  return (
    <Bloom duration={0.7} delay={0.18} className="mx-auto mt-10 max-w-[720px]">
      <div
        data-testid="answer-cta"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-card px-5 py-3.5 shadow-card"
      >
        <p className="text-[14px] text-ink-soft">
          Get a grounded answer from your books
        </p>
        <button
          type="button"
          onClick={onAsk}
          className="rounded-pill border-[1.5px] border-apricot px-4 py-1.5 text-[13px] font-bold text-apricot-deep transition-colors hover:bg-apricot-soft"
        >
          Ask the shelf
        </button>
      </div>
    </Bloom>
  );
}
