import { Link, useLocation } from "react-router";
import type { AnswerResponse } from "../../api";
import { Bloom, Eyebrow, withReturnTo } from "../../ui";
import { inlineCiteOccurrences } from "./answerText";
import { AnswerText, type CitationMap, TrailingChips } from "./CitationChips";

const NUMERALS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"];

export function AnswerCard({ answer }: { answer: AnswerResponse }) {
  /* Picks and chips capture the same URL — same page, same provenance. */
  const location = useLocation();
  const map: CitationMap = new Map(
    answer.citations.map((c) => [c.citation_id, c]),
  );
  /* The eyebrow counts the chips it is about to render, not the distinct
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
    <Bloom duration={0.7} delay={0.2} className="mt-14">
      <section className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] overflow-hidden rounded-panel border border-line bg-card shadow-card max-[960px]:grid-cols-1">
        <div className="px-[38px] py-[34px]">
          <Eyebrow>
            Grounded in your books · {chipCount} citation
            {chipCount === 1 ? "" : "s"}
          </Eyebrow>
          <div className="mt-5">
            <AnswerText text={answer.answer.text} map={map} />
          </div>
          <TrailingChips citations={answer.citations} inlineIds={inline} />
        </div>
        <aside
          className="flex flex-col gap-3.5 border-l border-line p-[30px] max-[960px]:border-t max-[960px]:border-l-0"
          style={{ background: "var(--gradient-warm)" }}
        >
          <h4 className="text-[12px] font-bold tracking-[0.12em] text-ink-faint uppercase">
            Tonight's picks
          </h4>
          {answer.recommendations.map((pick, index) => (
            <Link
              key={pick.knowledge_item_id}
              to={withReturnTo(`/recipes/${pick.knowledge_item_id}`, location)}
              className="flex items-start gap-3 rounded-reco border border-line bg-card px-4 py-3.5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-card"
            >
              <span className="pt-px font-display text-[15px] font-semibold text-apricot italic">
                {NUMERALS[index] ?? index + 1}.
              </span>
              <span>
                <b className="block text-[14.5px] font-bold">{pick.title}</b>
                <span className="mt-0.5 block text-[12.5px] text-ink-soft">
                  {pick.reason}
                </span>
              </span>
            </Link>
          ))}
        </aside>
      </section>
    </Bloom>
  );
}
