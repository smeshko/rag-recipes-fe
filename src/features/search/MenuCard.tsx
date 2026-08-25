import { Link, useLocation } from "react-router";
import { isMenuFallback, type MenuResponse } from "../../api";
import { withReturnTo } from "../../ui";
import { inlineCiteOccurrences } from "./answerText";
import { AnswerText, type CitationMap, TrailingChips } from "./CitationChips";

/* The composed menu, inline — the same treatment AnswerCard now gets, and for
   the same reason: a generated result is content in the column, not a framed
   document beside it. The coherence argument runs as prose (same parser, same
   chips — the backend emits the same cite_N markers), then the courses as a
   list beneath it rather than in a tinted rail.

   A course the shelf could not fill is still reported as such rather than
   dropped: the reader asked for it. It keeps a dashed outline, which is the
   one border left here — an absence needs a shape to be visible at all. */
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
    <section data-testid="menu-card" className="mt-10 max-[560px]:mt-7">
      <p className="text-[13px] text-fg-subtle">
        A menu from your books · {filled} of {menu.courses.length} course
        {menu.courses.length === 1 ? "" : "s"}
      </p>
      <h3 className="mt-2 text-[20px] leading-[1.3] font-semibold tracking-[-0.01em]">
        {menu.menu.title}
      </h3>
      {menu.theme ? (
        <p className="mt-1 text-[14px] text-fg-muted">{menu.theme}</p>
      ) : null}
      {fallback ? (
        /* The service's own words, once. Content, not an alert: the courses
           below are still real picks, just without the argument. */
        <p
          role="status"
          className="mt-4 rounded-reco border border-warning-border bg-warning-fill px-4 py-3 text-[14px] text-warning"
        >
          {menu.warnings.join(" ")}
        </p>
      ) : null}
      {menu.menu.text ? (
        <div className="mt-4">
          <AnswerText text={menu.menu.text} map={map} />
        </div>
      ) : null}
      <TrailingChips citations={menu.citations} inlineIds={inline} />

      <div className="mt-8">
        <h4 className="text-[14px] font-medium text-fg-muted">The courses</h4>
        <div className="-mx-2.5 mt-1">
          {menu.courses.map((course) =>
            course.selection ? (
              <Link
                key={course.slot}
                to={withReturnTo(
                  `/recipes/${course.selection.knowledge_item_id}`,
                  location,
                )}
                className="block rounded-[10px] px-2.5 py-2.5 transition-colors hover:bg-surface-hover"
              >
                {/* The slot keeps the accent, and is the last small-caps label
                    in the app: it is a fixed taxonomy (STARTER / MAIN / …),
                    not prose, and it is what makes the list scannable as a
                    menu rather than as three unrelated recipes. */}
                <span className="block text-[11px] font-semibold tracking-[0.08em] text-accent uppercase">
                  {course.slot}
                </span>
                <b className="mt-0.5 block text-[15px] font-medium">
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
                className="mx-2.5 mt-1 rounded-[10px] border border-dashed border-border px-3 py-2.5"
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
        </div>
      </div>
    </section>
  );
}
