import { Link, useLocation } from "react-router";
import type { AnswerResponse } from "../../api";
import { withReturnTo } from "../../ui";
import { inlineCiteOccurrences } from "./answerText";
import { AnswerText, type CitationMap, TrailingChips } from "./CitationChips";

/* The answer, rendered INLINE — no card, no border, no fill, no two-column
 * grid, no bordered aside.
 *
 * It used to be a 22px-radius panel split into a prose column and a tinted
 * recommendations rail, which made a generated answer the loudest object on
 * the page and framed it as a separate document. The target's own answers are
 * not framed at all: assistant text simply flows in the content column, and
 * only the USER's turn gets a bubble. Whitespace and a small meta line do the
 * separating that the border used to.
 *
 * The picks follow as a plain list rather than a sidebar. They were never a
 * parallel surface — they are the tail of the answer, and reading order should
 * say so, which it now does at every width instead of only under 960px.
 * The `max-[960px]` grid collapse went with the grid. */
export function AnswerCard({ answer }: { answer: AnswerResponse }) {
  /* Picks and chips capture the same URL — same page, same provenance. */
  const location = useLocation();
  const map: CitationMap = new Map(
    answer.citations.map((c) => [c.citation_id, c]),
  );
  /* The meta line counts the chips it is about to render, not the distinct
     sources: AnswerText emits one chip per inline marker, so a prose that
     cites the same page twice shows two chips, and a count of distinct ids
     would under-report what the reader can see. Unresolvable ids are
     filtered first — they render as nothing, so they must not be counted. */
  const occurrences = inlineCiteOccurrences(answer.answer.text).filter((id) =>
    map.has(id),
  );
  const inline = [...new Set(occurrences)];
  const trailingCount =
    new Set(answer.citations.map((c) => c.citation_id)).size - inline.length;
  const chipCount = occurrences.length + trailingCount;

  return (
    <section className="mt-10 max-[560px]:mt-7">
      <p className="text-[13px] text-fg-subtle">
        Grounded in your books · {chipCount} citation
        {chipCount === 1 ? "" : "s"}
      </p>
      <div className="mt-3">
        <AnswerText text={answer.answer.text} map={map} />
      </div>
      <TrailingChips citations={answer.citations} inlineIds={inline} />

      {answer.recommendations.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-[14px] font-medium text-fg-muted">
            Tonight's picks
          </h3>
          {/* Rows, not cards: a fill on hover and nothing at rest, the same
              affordance the nav rail uses. Negative margin so the hover fill
              bleeds into the gutter and the text still lines up with the
              prose above it. */}
          <div className="mt-1 -mx-2.5">
            {answer.recommendations.map((pick) => (
              <Link
                key={pick.knowledge_item_id}
                to={withReturnTo(
                  `/recipes/${pick.knowledge_item_id}`,
                  location,
                )}
                className="block rounded-[10px] px-2.5 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <span>
                  <b className="block text-[15px] font-medium">{pick.title}</b>
                  <span className="mt-0.5 block text-[13px] text-fg-muted">
                    {pick.reason}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
