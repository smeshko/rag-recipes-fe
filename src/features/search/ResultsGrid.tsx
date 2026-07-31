import type { ReactNode } from "react";
import type { SearchMode } from "../../api/search";
import type { KnowledgeItemResult } from "../../api/types";
import { Bloom } from "../../ui";
import { ResultCard } from "./ResultCard";

export interface ResultsGridProps {
  /* Results arrive as a prop — no hooks in here. 2.3 renders this same grid
     from a mutation; an internal useSearch would fire a rogue query there. */
  results: KnowledgeItemResult[];
  q: string;
  mode: SearchMode;
  /** Dim while a mode re-query is in flight (isPlaceholderData). */
  dimmed?: boolean;
  /** 2.3 fallback extension — defaults preserve 2.1's exact rendering. */
  heading?: ReactNode;
  subline?: ReactNode;
  bloomBase?: number;
}

export function ResultsGrid({
  results,
  q,
  mode,
  dimmed = false,
  heading,
  subline,
  bloomBase = 0.3,
}: ResultsGridProps) {
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
          <span className="text-[13.5px] text-ink-faint">
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
            <ResultCard result={result} q={q} mode={mode} />
          </Bloom>
        ))}
      </div>
    </section>
  );
}
