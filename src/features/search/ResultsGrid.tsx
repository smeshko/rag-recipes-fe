import type { ReactNode } from "react";
import { useFavouriteIds } from "../../api";
import type { SearchMode } from "../../api/search";
import type { KnowledgeItemResult } from "../../api/types";
import { Bloom } from "../../ui";
import { ResultCard } from "./ResultCard";

export interface ResultsGridProps {
  /* Results arrive as a prop — no hooks in here. 2.3 renders this same grid
     from a mutation; an internal useSearch would fire a rogue query there. */
  results: KnowledgeItemResult[];
  /** Labels the default subline only — provenance rides on `from`. */
  mode: SearchMode;
  /** The search that produced these results, as each card's return target. */
  from: { pathname: string; search: string };
  /** Dim while a mode re-query is in flight (isPlaceholderData). */
  dimmed?: boolean;
  /** 2.3 fallback extension — defaults preserve 2.1's exact rendering. */
  heading?: ReactNode;
  subline?: ReactNode;
  bloomBase?: number;
}

export function ResultsGrid({
  results,
  mode,
  from,
  dimmed = false,
  heading,
  subline,
  bloomBase = 0.3,
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
      <Bloom duration={0.7} delay={0.26}>
        <div className="mt-14 mb-[22px] flex items-baseline justify-between">
          <h2 className="font-display text-[27px] font-semibold">
            {heading ?? (
              <>
                {results.length} match{results.length === 1 ? "" : "es"}
              </>
            )}
          </h2>
          <span className="text-[13.5px] text-fg-subtle">
            {subline ?? <>ranked by {mode} score · needs-review excluded</>}
          </span>
        </div>
      </Bloom>
      <div className="grid grid-cols-3 gap-[22px] max-[960px]:grid-cols-1">
        {results.map((result, index) => (
          <Bloom
            key={result.item.id}
            index={index}
            base={bloomBase}
            className="flex"
          >
            <ResultCard
              result={result}
              from={from}
              favourited={favourites.data?.has(result.item.id) ?? false}
            />
          </Bloom>
        ))}
      </div>
    </section>
  );
}
