import { Link } from "react-router";
import type { KnowledgeItemResult } from "../../api/types";
import { Card, withReturnTo } from "../../ui";
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
  const badges = result.display.badges;

  /* The star is a SIBLING of the link, not a child of it: a <button> inside an
     <a> is invalid HTML, and the click would navigate to the recipe instead of
     saving it. The wrapper is the positioning context.
   *
   * It sits TOP-RIGHT now. It used to float bottom-right over a reserved
   * full-height spacer row, which cost every card ~36px of vertical space for
   * one icon and left a visible gap under short cards. Top-right is also what
   * every comparable grid does (Instacart, Walmart, Turo all put save there),
   * and it needs no reserved space at all — the header row already has room
   * once the page label moves in beside the book title. `pr-9` on the header
   * keeps a long book title from running underneath it. */
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
            <span className="pr-9">
              {result.document.title}
              {result.source_citations[0] ? (
                <>
                  {/* Separator in its own node so the label stays a whole
                      text node of its own — joined, it read as " · page 22"
                      and nothing could address the label by name. */}
                  <span aria-hidden="true" className="opacity-50">
                    {" · "}
                  </span>
                  <span className="opacity-70">
                    {result.source_citations[0].label}
                  </span>
                </>
              ) : null}
            </span>
          }
        >
          {/* The card's only hover cue beyond Card's own border step: the
              title takes link ink, which is what the whole card is. */}
          <h3 className="text-[15px] font-semibold leading-[1.4] transition-colors group-hover:text-accent">
            {result.display.title}
          </h3>
          {result.display.snippet ? (
            /* line-clamp, not overflow-hidden: an extraction summary runs to
               any length, and a hard crop cut words mid-letter with no signal
               that anything was missing. Three lines plus an ellipsis says
               "there is more" and keeps every card's body the same height. */
            <p className="mt-2 line-clamp-3 text-[14px] text-fg-muted">
              {result.display.snippet}
            </p>
          ) : null}
          {ingredients.length > 0 ? (
            <p className="mt-2.5 line-clamp-2 text-[13px] text-fg-subtle">
              {ingredients.join(" · ")}
            </p>
          ) : null}
          {badges.length > 0 ? (
            /* Plain dot-separated text, NOT pills. These carry free-form
               extraction output — "2 hours, 45 minutes (mostly roasting
               time)" is a real value — and a pill is a fixed-width-ish shape
               for a short categorical tag. Wrapped in one, a sentence became a
               three-line lozenge that dominated the card. Every comparable
               recipe grid (Julienne, Blue Apron, Instacart, Walmart) renders
               time and servings exactly this way; the pills there are reserved
               for one-word tags like "Vegan". */
            <p className="mt-2.5 line-clamp-2 text-[13px] text-fg-subtle">
              {badges.join(" · ")}
            </p>
          ) : null}
          {/* mt-auto, not a spacer: pushes nothing, but lets a short card's
              content sit at the top of an equal-height grid cell. */}
          <div aria-hidden="true" className="mt-auto" />
        </Card>
      </Link>
      {/* items-end so a failed toggle's message stacks below the star and
          stays inside the card rather than pushing off its right edge. */}
      <div className="absolute top-2.5 right-2.5 z-10 flex flex-col items-end gap-1.5">
        <FavouriteButton
          itemId={result.item.id}
          favourited={favourited}
          title={result.display.title}
        />
      </div>
    </div>
  );
}
