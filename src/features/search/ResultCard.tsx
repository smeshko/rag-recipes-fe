import { Link } from "react-router";
import type { SearchMode } from "../../api/search";
import type { KnowledgeItemResult } from "../../api/types";
import { Card, Pill } from "../../ui";
import { accentFor } from "./accent";

export interface ResultCardProps {
  result: KnowledgeItemResult;
  /* {q, mode} exactly — 2.2's crumb destructures both by name, and mode
     changes the result set, so a back link from q alone would return a
     vector-mode searcher to hybrid results. */
  q: string;
  mode: SearchMode;
}

export function ResultCard({ result, q, mode }: ResultCardProps) {
  const ingredients = result.structured_preview?.top_ingredients ?? [];

  return (
    <Link
      to={`/recipes/${result.item.id}`}
      state={{ q, mode }}
      className="group flex"
    >
      <Card
        accent={accentFor(result.document.id)}
        className="flex w-full flex-col"
        header={
          <>
            {result.document.title}
            {result.source_citations[0] ? (
              <span className="font-semibold tracking-[0.04em] opacity-80">
                {result.source_citations[0].label}
              </span>
            ) : null}
          </>
        }
      >
        <h3 className="font-display text-[19.5px] font-semibold leading-[1.28] transition-colors group-hover:text-apricot">
          {result.display.title}
        </h3>
        {result.display.snippet ? (
          <p className="mt-2 flex-1 text-[13.5px] text-ink-soft">
            {result.display.snippet}
          </p>
        ) : null}
        {ingredients.length > 0 ? (
          <p className="mt-3 text-[12.5px] text-ink-faint italic">
            {ingredients.join(" · ")}
          </p>
        ) : null}
        {result.display.badges.length > 0 ? (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {result.display.badges.map((badge) => (
              <Pill key={badge}>{badge}</Pill>
            ))}
          </div>
        ) : null}
      </Card>
    </Link>
  );
}
