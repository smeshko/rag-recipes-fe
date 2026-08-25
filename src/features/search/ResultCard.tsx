import { Link } from "react-router";
import type { KnowledgeItemResult } from "../../api/types";
import { Card, Pill, withReturnTo } from "../../ui";
import { FavouriteButton } from "../favourites/FavouriteButton";
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
  /* Whether this recipe is starred, from the page's ['favourites'] id set.
     A search result is the one row shape that cannot answer for itself —
     `/search` projects the retrieval layer, which knows nothing about stars
     (see `useFavouriteIds`). Absent (the set has not loaded, or an outage)
     reads as "not starred": the button still works, and the first response
     corrects it. */
  favourited?: boolean;
}

export function ResultCard({
  result,
  from,
  favourited = false,
}: ResultCardProps) {
  const ingredients = result.structured_preview?.top_ingredients ?? [];

  /* The star is a SIBLING of the link, not a child of it: a <button> inside
     an <a> is invalid HTML, and the click would navigate to the recipe
     instead of saving it. The wrapper is the positioning context; the button
     floats over the card's bottom-right corner, and the body ends with a
     spacer of the star's own height — a card whose snippet or badges ran to
     the bottom edge would otherwise print text underneath it. Reserving a
     whole row rather than padding each trailing element keeps the body text
     full-width, which is what the three-column grid needs at 300px. */
  return (
    <div className="relative flex w-full">
      <Link
        to={withReturnTo(`/recipes/${result.item.id}`, from)}
        className="group flex w-full"
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
          {/* The star's reserved row. aria-hidden and empty: it is layout,
              not content, and the control itself is a sibling of the link. */}
          <div aria-hidden="true" className="mt-3 h-9" />
        </Card>
      </Link>
      {/* items-end so a failed toggle's message stacks ABOVE the star and
          stays inside the card rather than pushing off its right edge. */}
      <div className="absolute right-3 bottom-3 z-10 flex flex-col items-end gap-1.5">
        <FavouriteButton
          itemId={result.item.id}
          favourited={favourited}
          title={result.display.title}
          className="shadow-card"
        />
      </div>
    </div>
  );
}
