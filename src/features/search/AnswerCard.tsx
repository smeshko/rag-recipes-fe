import { Link } from "react-router";
import type { AnswerResponse } from "../../api";
import type { SearchMode } from "../../api/search";
import { Bloom, Eyebrow } from "../../ui";
import { inlineCiteIds } from "./answerText";
import { AnswerText, type CitationMap, TrailingChips } from "./CitationChips";

const NUMERALS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"];

export function AnswerCard({
  answer,
  q,
  mode,
}: {
  answer: AnswerResponse;
  q: string;
  mode: SearchMode;
}) {
  const map: CitationMap = new Map(
    answer.citations.map((c) => [c.citation_id, c]),
  );
  /* Count and chips both derive from citations[] — the union the backend
     builds — so the eyebrow can never disagree with the rendered chips. */
  const distinctCount = new Set(answer.citations.map((c) => c.citation_id))
    .size;
  const inline = inlineCiteIds(answer.answer.text).filter((id) => map.has(id));

  return (
    <Bloom duration={0.7} delay={0.2} className="mt-14">
      <section className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] overflow-hidden rounded-panel border border-line bg-card shadow-card max-[960px]:grid-cols-1">
        <div className="px-[38px] py-[34px]">
          <Eyebrow>
            Grounded in your books · {distinctCount} citation
            {distinctCount === 1 ? "" : "s"}
          </Eyebrow>
          <div className="mt-5">
            <AnswerText text={answer.answer.text} map={map} q={q} mode={mode} />
          </div>
          <TrailingChips
            citations={answer.citations}
            inlineIds={inline}
            q={q}
            mode={mode}
          />
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
              to={`/recipes/${pick.knowledge_item_id}`}
              state={{ q, mode }}
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
