import { Link, useSearchParams } from "react-router";
import type { KnowledgeItemResponse, ReviewFlag } from "../../api";
import { readReturnTo, withReturnTo } from "../../ui";

/* The read page's review block (5.4 TASK-005): one surface doing three jobs
   for a `needs_review` item — what is still flagged, whether anyone has
   corrected it already, and the way in.

   FLAGS. `review_reasons` renders in the order the backend sent it, each line
   `message || code` — the same fallback `ReviewItemCard` uses, and for the
   same reason: `code` is an opaque backend enum used as a stable key, the
   message is backend-authored copy rendered verbatim, and the FE keeps no
   code→copy table of its own. The lead/secondary split mirrors the queue card
   deliberately without sharing a component: the two surfaces have different
   chrome and tone (the queue's is danger, an undecided recipe's is a warning),
   and one abstraction would fit neither.

   THE CLEARED STATE. A block that simply vanishes when the last flag goes is
   indistinguishable from one that never rendered — and "the reviewer sees
   which warnings their fix cleared" is the whole point of the epic. So an
   empty `review_reasons` on a still-undecided item renders an explicit line,
   in the success tone, rather than nothing.

   THE EDIT LINK forwards the recipe's own VALIDATED return target, not the
   recipe's URL. Capturing `/recipes/:id` would pass `readReturnTo` and then
   classify as `null` in `returnSection`, so the editor's back link would fall
   through to its fourth arm and drop the reviewer on search instead of the
   queue they were working through. This is `RecipeEditForm`'s `readHref`
   idiom run in the opposite direction.

   NOT rendered for a decided item, even though the backend projects
   `review_reasons: []` for one: a settled recipe has no review affordance,
   and the editor would refuse it anyway (`NotEditable`). */

const flagText = (flag: ReviewFlag) => flag.message || flag.code;

export function ReviewCallout({ item }: { item: KnowledgeItemResponse }) {
  const [searchParams] = useSearchParams();
  const { id, status, review_reasons: flags, edited_at } = item.knowledge_item;

  if (status !== "needs_review") {
    return null;
  }

  const [lead, ...secondaries] = flags;
  const cleared = lead === undefined;

  const target = readReturnTo(searchParams);
  const editHref = target
    ? withReturnTo(`/recipes/${id}/edit`, { pathname: target.to, search: "" })
    : `/recipes/${id}/edit`;

  return (
    <section
      data-testid="review-callout"
      /* Panel's radius, role tokens only. Warning while something is still
         flagged; success once the list empties — the tone IS the state. */
      className={`mt-8 flex flex-wrap items-start justify-between gap-4 rounded-[20px] border px-7 py-6 max-[560px]:px-5 max-[560px]:py-5 ${
        cleared
          ? "border-success-fill bg-success-fill"
          : "border-warning-border bg-warning-fill"
      }`}
    >
      <div className="min-w-[260px] flex-1">
        {cleared ? (
          <p
            data-testid="review-callout-cleared"
            className="text-[13.5px] font-semibold text-success"
          >
            Nothing is flagged any more — approve it from the queue.
          </p>
        ) : (
          <>
            <p
              data-testid="recipe-flag-lead"
              className="text-[13.5px] font-semibold text-warning"
            >
              {flagText(lead)}
            </p>
            {/* Keyed by code AND message: `code` alone is not unique. Every
                warning the backend has no modelled copy for collapses onto
                the single `llm_warning` fallback envelope
                (docs/review-api-contract.md §1), so two unmodelled warnings
                on one item render two siblings with the same code. The list
                is derived, never reordered in place, so the pair is stable. */}
            {secondaries.map((flag) => (
              <p
                key={`${flag.code}:${flag.message}`}
                data-testid="recipe-flag-secondary"
                className="mt-1 text-[12.5px] font-semibold text-warning/85"
              >
                {flagText(flag)}
              </p>
            ))}
          </>
        )}
        {/* The marker is a timestamp, not a date: `dateTime` carries the
            server's value verbatim and the visible text stays "Edited". No
            formatting — a relative or localised date here would be a second
            source of truth about when, for no reviewer benefit. */}
        {edited_at ? (
          <p className="mt-2">
            <time
              data-testid="recipe-edited-marker"
              dateTime={edited_at}
              className="text-[12px] font-semibold text-fg-subtle"
            >
              Edited
            </time>
          </p>
        ) : null}
      </div>
      <Link
        to={editHref}
        data-testid="recipe-edit-link"
        className={`inline-flex items-center rounded-pill border-[1.5px] px-4 py-1.5 text-[13px] font-bold pointer-coarse:min-h-11 transition-colors ${
          cleared
            ? "border-success/40 text-success hover:bg-success/8"
            : "border-warning-border text-warning hover:bg-warning/8"
        }`}
      >
        Edit this recipe →
      </Link>
    </section>
  );
}
