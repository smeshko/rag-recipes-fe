import type { ReactNode } from "react";
import { Link } from "react-router";
import { ApiError } from "../../../api";
import { Panel } from "../../../ui";
import { statusTone } from "../statusTone";

/**
 * The one pre-form state the read page has no equivalent for: the item loaded
 * fine and is recipe-shaped, but it is not waiting for review, so there is
 * nothing here to repair. Not-found, error and not-a-recipe reuse
 * `RecipeStates` verbatim — this file exists so no read-mode file grows an
 * edit-only branch (D3).
 *
 * Calm, not danger-toned: an already-approved item is an expected dead end.
 * The subline echoes the item's *actual* status through `statusTone`, so an
 * unrecognised backend status still names itself rather than hiding behind
 * the generic headline.
 */
export function NotEditable({
  status,
  id,
}: {
  status: string;
  id: string | undefined;
}) {
  const { label } = statusTone(status);
  return (
    <div className="pt-16">
      <Panel className="mx-auto max-w-[560px] text-center">
        <p className="font-display text-[18px] font-semibold">
          {status === "indexing"
            ? "This one is being re-indexed."
            : "This one can't be edited."}
        </p>
        <p className="mt-1 text-[13.5px] text-fg-muted">
          {status === "indexing" ? (
            <>
              A save is still working its way through — try again in a moment.
            </>
          ) : (
            <>
              Only shelved recipes and items awaiting review can be edited. This
              one is <b className="font-semibold">{label}</b>.
            </>
          )}
        </p>
        <p className="mt-5">
          <Link
            to={`/recipes/${id}`}
            className="text-[12.5px] font-bold text-accent hover:underline inline-flex items-center pointer-coarse:min-h-11"
          >
            View the recipe →
          </Link>
        </p>
      </Panel>
    </div>
  );
}

/**
 * Copy by CODE, never by message (D11). These four are the whole guard stack
 * a save can lose to, and each one names a different next move for the
 * reviewer — "someone beat you to it" and "this book is mid-reprocess" are
 * not the same news. The backend's own sentences are written for an API
 * caller ("editing is refused (reject to clear it)"), so this is the one
 * place the house rule bends: an ENUMERATED code gets FE copy. Everything
 * else still renders the backend's message verbatim.
 */
const REFUSED_COPY: Record<string, string> = {
  review_not_pending:
    "Someone has already decided this item, so your changes were not saved.",
  review_item_stale:
    "This book was reprocessed; this item belongs to an older extraction and can no longer be edited.",
  ingestion_already_running:
    "This book is being reprocessed right now. Try again once it settles.",
  knowledge_item_not_found: "This item no longer exists.",
};

/* Role tokens only, both palettes (D13). Danger is reserved for the arm where
   the reviewer's work did NOT land; the other two are warnings, because the
   text is still on screen and — proactively — may still save. */
const TONE = {
  danger: {
    panel: "border-danger-border bg-danger-fill",
    text: "text-danger",
  },
  warning: {
    panel: "border-warning-border bg-warning-fill",
    text: "text-warning",
  },
} as const;

function ConflictBanner({
  tone,
  children,
}: {
  tone: keyof typeof TONE;
  children: ReactNode;
}) {
  return (
    /* `ReviewCallout`'s idiom — Panel's radius and padding on a plain element,
       role tokens only — and NOT `Panel` itself, which is the reason: Panel
       bakes in `bg-surface-raised`, and Tailwind orders utilities
       alphabetically in the sheet rather than by the order of the class
       attribute, so an appended `bg-danger-fill` loses to it (`danger-fill` <
       `surface-raised`) while `bg-warning-fill` wins. A conflict that paints
       its tint in one tone and not the other is worse than none.
       `role="alert"` on the surface itself: the proactive arm appears without
       the reviewer touching anything, so it has to announce. */
    <div
      role="alert"
      className={`mt-6 rounded-[20px] border px-7 py-6 max-[560px]:px-5 max-[560px]:py-5 ${TONE[tone].panel}`}
    >
      <p className={`text-[13.5px] font-semibold ${TONE[tone].text}`}>
        {children}
      </p>
    </div>
  );
}

/**
 * The one place an edit conflict is rendered — both triggers, one voice.
 *
 * - `error`: the save the backend REFUSED. Coded copy above, danger-toned.
 * - `approveError`: a DOWNSTREAM failure after a committed patch. Warning,
 *   and it leads with the reassurance — the edit is on the server, so this
 *   must never read like a failed save.
 * - `status`: the page OBSERVED the item leave `needs_review` under an open
 *   draft. Proactive, warning-toned, and deliberately not a dead end: the
 *   cached read is not the authority, the guarded UPDATE is, so the reviewer
 *   keeps both their text and the control that might still land it.
 *
 * Precedence is the order above, and the three are mutually exclusive in
 * practice: `submit()` clears both error fields before every attempt, and a
 * save-provoked answer is newer news than the cached status that preceded it.
 *
 * Calm register, like `NotEditable`'s: two people working the same queue is
 * an expected outcome, not a crash.
 */
export function SaveConflict({
  status,
  error,
  approveError,
}: {
  status?: string;
  /* `Error`, not `ApiError`: that is what `useUpdateKnowledgeItem`'s mutation
     generic hands the form. The `instanceof` narrow below is what unlocks
     `code`, and the fallback wants any Error's message anyway. */
  error?: Error | null;
  approveError?: string | null;
}) {
  if (error) {
    const coded =
      error instanceof ApiError ? REFUSED_COPY[error.code] : undefined;
    return (
      <ConflictBanner tone="danger">{coded ?? error.message}</ConflictBanner>
    );
  }

  if (approveError) {
    return (
      <ConflictBanner tone="warning">
        Saved — but the approval failed: {approveError}
      </ConflictBanner>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <ConflictBanner tone="warning">
      This item is no longer waiting for review — it is{" "}
      {/* The emphasis spans "now {label}" rather than the label alone: the
          news is the CHANGE, and the head already carries a Pill reading the
          bare status. */}
      <b className="font-bold">now {statusTone(status).label}</b>. Your changes
      are still here, but saving them may be refused.
    </ConflictBanner>
  );
}
