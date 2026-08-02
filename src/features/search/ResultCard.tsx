import { Link } from "react-router";
import type { KnowledgeItemResult } from "../../api/types";
import { Card, Pill, withReturnTo } from "../../ui";
import { accentFor } from "./accent";

export interface ResultCardProps {
  result: KnowledgeItemResult;
  /* The search these cards came out of, as a location — not read from
     useLocation here (review #2.2). During a mode change the grid holds the
     previous mode's results while the URL already names the new one, and a
     card that captured the URL would send the reader back to a result set the
     card they clicked is not in. The owner of the results says which search
     produced them; it builds that with the same nextSearchParams rule the URL
     itself is built from, so nothing is reconstructed by hand. */
  from: { pathname: string; search: string };
}

export function ResultCard({ result, from }: ResultCardProps) {
  const ingredients = result.structured_preview?.top_ingredients ?? [];

  return (
    <Link
      to={withReturnTo(`/recipes/${result.item.id}`, from)}
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
        <h3 className="font-display text-[19.5px] font-semibold leading-[1.28] transition-colors group-hover:text-accent">
          {result.display.title}
        </h3>
        {result.display.snippet ? (
          <p className="mt-2 flex-1 text-[13.5px] text-fg-muted">
            {result.display.snippet}
          </p>
        ) : null}
        {ingredients.length > 0 ? (
          <p className="mt-3 text-[12.5px] text-fg-subtle italic">
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
