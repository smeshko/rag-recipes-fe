import type { KnowledgeItemResponse, ReviewFlag } from "../../api";
import { flagDetail } from "./reviewMarks";

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

   THE EDIT LINK LIVES ELSEWHERE NOW. It moved to `RecipeActions`, which
   renders on every recipe rather than only a flagged one — leaving it here as
   well would put two Edit buttons on the same page. The return-target
   forwarding it depended on moved with it, unchanged.

   NOT rendered for a decided item, even though the backend projects
   `review_reasons: []` for one: a settled recipe has nothing flagged to say.
   The verbs are no longer gated on this, so a shelved recipe still gets its
   Edit and Delete from `RecipeActions` above. */

const flagText = (flag: ReviewFlag) => flag.message || flag.code;

/** The score line under a flag — observed value, current bound, marked-row
    count — rendered only when the backend sent the aids (`flagDetail`). */
function FlagDetail({ flag }: { flag: ReviewFlag }) {
  const detail = flagDetail(flag);
  /* A sibling of the flag line, not a child: the flag's own text stays the
     backend's copy verbatim, and the aid reads as its footnote. */
  return detail ? (
    <p
      data-testid="review-flag-detail"
      className="font-mono text-[11.5px] font-semibold text-warning/70"
    >
      {detail}
    </p>
  ) : null;
}

export function ReviewCallout({ item }: { item: KnowledgeItemResponse }) {
  const { status, review_reasons: flags, edited_at } = item.knowledge_item;

  if (status !== "needs_review") {
    return null;
  }

  const [lead, ...secondaries] = flags;
  const cleared = lead === undefined;

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
            <FlagDetail flag={lead} />
            {/* Keyed by code AND message: `code` alone is not unique. Every
                warning the backend has no modelled copy for collapses onto
                the single `llm_warning` fallback envelope
                (docs/review-api-contract.md §1), so two unmodelled warnings
                on one item render two siblings with the same code. The list
                is derived, never reordered in place, so the pair is stable. */}
            {secondaries.map((flag) => (
              <div key={`${flag.code}:${flag.message}`}>
                <p
                  data-testid="recipe-flag-secondary"
                  className="mt-1 text-[12.5px] font-semibold text-warning/85"
                >
                  {flagText(flag)}
                </p>
                <FlagDetail flag={flag} />
              </div>
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
    </section>
  );
}
