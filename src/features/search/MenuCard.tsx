import { Link, useLocation } from "react-router";
import { isMenuFallback, type MenuResponse } from "../../api";
import { Bloom, Eyebrow, withReturnTo } from "../../ui";
import { inlineCiteOccurrences } from "./answerText";
import { AnswerText, type CitationMap, TrailingChips } from "./CitationChips";

/* The composed menu, in the answer card's chrome: the coherence argument as
   prose on the left (same parser, same chips — the backend emits the same
   cite_N markers), the courses down the right. A course the shelf could not
   fill is reported as such rather than dropped: the reader asked for it. */
export function MenuCard({ menu }: { menu: MenuResponse }) {
  const location = useLocation();
  const map: CitationMap = new Map(
    menu.citations.map((c) => [c.citation_id, c]),
  );
  const fallback = isMenuFallback(menu);
  const occurrences = inlineCiteOccurrences(menu.menu.text).filter((id) =>
    map.has(id),
  );
  const inline = [...new Set(occurrences)];
  const filled = menu.courses.filter((c) => c.selection !== null).length;

  return (
    <Bloom duration={0.7} delay={0.2} className="mt-14">
      <section
        data-testid="menu-card"
        className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] overflow-hidden rounded-panel border border-border bg-surface-raised max-[960px]:grid-cols-1"
      >
        <div className="px-[38px] py-[34px] max-[560px]:px-5 max-[560px]:py-6">
          <Eyebrow>
            A menu from your books · {filled} of {menu.courses.length} course
            {menu.courses.length === 1 ? "" : "s"}
          </Eyebrow>
          <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.01em] leading-[1.3]">
            {menu.menu.title}
          </h3>
          {menu.theme ? (
            <p className="mt-1 text-[14px] text-fg-muted">{menu.theme}</p>
          ) : null}
          {fallback ? (
            /* The service's own words, once. Content, not an alert: the
               courses below are still real picks, just without the argument. */
            <p
              role="status"
              className="mt-4 rounded-reco border border-warning-border bg-warning-fill px-4 py-3 text-[14px] text-warning"
            >
              {menu.warnings.join(" ")}
            </p>
          ) : null}
          {menu.menu.text ? (
            <div className="mt-5">
              <AnswerText text={menu.menu.text} map={map} />
            </div>
          ) : null}
          <TrailingChips citations={menu.citations} inlineIds={inline} />
        </div>
        <aside className="flex flex-col gap-3.5 border-l border-border bg-surface-inset p-[30px] max-[960px]:border-t max-[960px]:border-l-0 max-[560px]:p-5">
          <h4 className="text-[11px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
            The courses
          </h4>
          {menu.courses.map((course) =>
            course.selection ? (
              <Link
                key={course.slot}
                to={withReturnTo(
                  `/recipes/${course.selection.knowledge_item_id}`,
                  location,
                )}
                /* Border step on hover, matching the picks aside on the answer
                   card — the two asides are the same row shape. */
                className="block rounded-reco border border-border bg-surface-raised px-4 py-3.5 transition-colors hover:border-border-strong"
              >
                <span className="block text-[11px] font-semibold tracking-[0.08em] text-accent uppercase">
                  {course.slot}
                </span>
                <b className="mt-0.5 block text-[15px] font-semibold">
                  {course.selection.title}
                </b>
                {course.selection.reason ? (
                  <span className="mt-0.5 block text-[13px] text-fg-muted">
                    {course.selection.reason}
                  </span>
                ) : null}
              </Link>
            ) : (
              <div
                key={course.slot}
                className="rounded-reco border border-dashed border-border px-4 py-3.5"
              >
                <span className="block text-[11px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                  {course.slot}
                </span>
                <span className="mt-0.5 block text-[13px] text-fg-muted">
                  Nothing on the shelf fits this course.
                </span>
              </div>
            ),
          )}
        </aside>
      </section>
    </Bloom>
  );
}
