import type { ReactNode } from "react";
import { useFavouriteIds } from "../../api";
import type { KnowledgeItemResult } from "../../api/types";
import { ResultCard } from "./ResultCard";

export interface ResultsGridProps {
  /* Results arrive as a prop — no hooks in here. 2.3 renders this same grid
     from a mutation; an internal useSearch would fire a rogue query there. */
  results: KnowledgeItemResult[];
  /** The search that produced these results, as each card's return target. */
  from: { pathname: string; search: string };
  /** Dim while a mode re-query is in flight (isPlaceholderData). */
  dimmed?: boolean;
  /** 2.3 fallback extension — defaults preserve 2.1's exact rendering. */
  heading?: ReactNode;
  /** Optional right-hand note. Nothing renders when it is absent: retrieval
      mode and the needs-review filter used to live here, and neither is the
      reader's business — they are knobs the composer already owns. */
  subline?: ReactNode;
}

export function ResultsGrid({
  results,
  from,
  dimmed = false,
  heading,
  subline,
}: ResultsGridProps) {
  /* ONE read for the whole grid, not one per card: every card would otherwise
     mount its own hook against the same ['favourites'] entry. The prop-only
     rule above is about RESULTS — this is the grid's own chrome, and it is
     also the only place on this screen that knows a star exists.

     No loading state: an unresolved set means no card is starred yet, which
     is the same thing an empty set means, and the entry lands in one request.
     A failed one leaves every star hollow but still clickable — the toggle is
     idempotent, so pressing it says the truth to the server either way. */
  const favourites = useFavouriteIds();

  return (
    <section className={dimmed ? "opacity-60 transition-opacity" : undefined}>
      <div>
        <div className="mt-14 mb-[22px] flex items-baseline justify-between">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em]">
            {heading ?? (
              <>
                {results.length} match{results.length === 1 ? "" : "es"}
              </>
            )}
          </h2>
          {subline ? (
            <span className="text-[13px] text-fg-subtle">{subline}</span>
          ) : null}
        </div>
      </div>
      {/* Three tiers now that the page is 1160 wide: three cards, then two,
          then one. Without the middle step a 1000px window jumped straight
          from three columns to a single full-width card. */}
      <div className="grid grid-cols-3 gap-5 max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1">
        {results.map((result) => (
          <div key={result.item.id} className="flex">
            <ResultCard
              result={result}
              from={from}
              favourited={favourites.data?.has(result.item.id) ?? false}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
