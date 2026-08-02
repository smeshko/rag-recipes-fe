import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import {
  type ReviewFlag,
  type ReviewItem,
  type ReviewListResponse,
  useReviewDecision,
} from "../../api";
import { withReturnTo } from "../../ui";

/* The flagged-item card (phase 4.3, TASK-002). A vertical-list composition of
   primitives — NOT `Card`, which is the 3-col grid shape — on the BookRow
   surface, minus the hover lift: the card itself is not clickable, only its
   link (and TASK-004's action buttons) are.

   Flags come FIRST and every one renders. Messages are sentence-length
   backend-authored copy rendered verbatim — a line, not a `Pill` (Pill is
   non-wrapping inline-flex and cannot hold sentences). The FE keeps no
   code→copy table: `code` is an opaque backend enum used only as a stable
   key, and the only fallback for an empty `message` is the raw code string.

   Every link OFF this card carries the queue's whole URL as `?from=`
   (phase 5.1's return-to contract): the ?document= filter the reviewer is
   working through lives only in that URL, so a link that drops it strands
   them on the unfiltered queue — or, before the contract, on `/`.

   Decisions (TASK-004) run through 4.2's `useReviewDecision(itemId, options)`
   seam as a pure consumer: the card supplies ONLY the snapshot / optimistic
   removal / rollback choreography — every re-sync invalidation is the hook's
   own composed settle (4.2 D8), so no `onSettled` is passed here.

   The optimistic removal UNMOUNTS this card, so its `useState` cannot carry
   the failure message across the rollback re-mount — the decision error
   lives with the PAGE, keyed by item id, and arrives here as props. The
   reject-confirm state, by contrast, must be per-card `useState` (it
   survives list reshuffles when another card is removed, with no page-level
   index keying) — and losing it on this card's own unmount is correct. */

const flagText = (flag: ReviewFlag) => flag.message || flag.code;

/** `source_pages` is structured, so format inline (task note): `p. {start}`
    for a one-page span, `pp. {start}–{end}` otherwise; null start (the
    locator never resolved) → no span at all. */
const pageSpan = ({
  page_start,
  page_end,
}: ReviewItem["source_pages"]): string | null => {
  if (page_start === null) return null;
  if (page_end === null || page_end === page_start) return `p. ${page_start}`;
  return `pp. ${page_start}–${page_end}`;
};

/** Every ['review-items', …] entry as snapshotted for rollback — filtered
    and unfiltered lists can both hold the item. */
type ListSnapshot = [QueryKey, ReviewListResponse | undefined][];

export function ReviewItemCard({
  item,
  decisionError,
  onDecisionError,
}: {
  item: ReviewItem;
  /** The page-held failure message for THIS item, if its last decision failed. */
  decisionError?: string;
  /** Record (or clear, with null) this item's failure message on the page. */
  onDecisionError: (itemId: string, message: string | null) => void;
}) {
  /* NOT "non-empty by contract" — 5.4 TASK-008 observed the opposite on the
     live dev shelf. Editing recomputes the warnings server-side, so a repair
     that clears the last flag leaves an item that is still `needs_review`
     (nobody has decided it) and still in the queue with `flags: []`. The
     unguarded `flags[0]` read that assumption used to allow took the whole
     /review route down to React Router's error boundary — one repaired item
     hid every other card. */
  const [lead, ...secondaries] = item.flags;
  const cleared = lead === undefined;
  const span = pageSpan(item.source_pages);

  const queryClient = useQueryClient();
  const [confirmingReject, setConfirmingReject] = useState(false);
  /* The queue's whole URL — `?document=` and its own `?from=` alike — is the
     return target; rebuilding it from props is the drift `?from=` removes. */
  const location = useLocation();

  const decide = useReviewDecision<ListSnapshot>(item.id, {
    onMutate: async () => {
      onDecisionError(item.id, null);
      /* Cancel in-flight list fetches so a late response cannot clobber the
         optimistic removal, snapshot EVERY review-items entry, then filter
         the item out of each. */
      await queryClient.cancelQueries({ queryKey: ["review-items"] });
      const snapshot: ListSnapshot =
        queryClient.getQueriesData<ReviewListResponse>({
          queryKey: ["review-items"],
        });
      queryClient.setQueriesData<ReviewListResponse>(
        { queryKey: ["review-items"] },
        (current) =>
          current && {
            review_items: current.review_items.filter(
              (candidate) => candidate.id !== item.id,
            ),
          },
      );
      return snapshot;
    },
    onError: (error, _decision, snapshot) => {
      /* Restore every snapshotted entry, then surface the message — the
         hook's composed settle handles the re-sync invalidations. */
      for (const [queryKey, data] of snapshot ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
      onDecisionError(item.id, error.message);
    },
  });

  return (
    <article className="rounded-[18px] border border-border bg-surface-raised px-6 py-5 shadow-card">
      {/* Success tone, not danger, and an explicit line rather than nothing:
          a card that simply loses its flag line is indistinguishable from one
          that never had flags, and "the reviewer sees which warnings their fix
          cleared" is the point of the epic. Same voice as the read page's
          `ReviewCallout` cleared arm, which already carried this state — the
          two surfaces stay deliberately separate components (they differ in
          chrome and tone) but must not disagree about the words. */}
      {cleared ? (
        <p
          data-testid="review-flag-cleared"
          className="text-[13px] font-semibold text-success"
        >
          Nothing is flagged any more — approve it to put it on the shelf.
        </p>
      ) : (
        <p
          data-testid="review-flag-lead"
          className="text-[13px] font-semibold text-danger"
        >
          {flagText(lead)}
        </p>
      )}
      {/* Code AND message: the backend's `llm_warning` fallback envelope is
          the code for EVERY unmodelled warning, so two of those on one item
          collide on `code` alone. Same key rule as `ReviewCallout`. */}
      {secondaries.map((flag) => (
        <p
          key={`${flag.code}:${flag.message}`}
          data-testid="review-flag-secondary"
          className="mt-1 text-[12px] font-semibold text-danger/80"
        >
          {flagText(flag)}
        </p>
      ))}

      <h3 className="mt-2 font-display text-[20px] font-semibold leading-[1.25]">
        {item.title}
      </h3>
      <small className="mt-1 block text-[12.5px] font-semibold text-fg-subtle">
        {span ? `${item.document.title} · ${span}` : item.document.title}
        {/* The edited marker (5.4 D9) rides on the provenance line at the same
            `text-fg-subtle` weight, not as a Pill or a tone of its own: it is
            provenance — someone has already corrected this — not a flag. The
            timestamp lives in `dateTime` and the visible text stays "Edited";
            formatting it would be a second source of truth about when, for no
            reviewer benefit. Same shape as the read page's marker. */}
        {item.edited_at ? (
          <>
            {" · "}
            <time data-testid="review-edited-marker" dateTime={item.edited_at}>
              Edited
            </time>
          </>
        ) : null}
      </small>
      {item.summary && (
        <p
          data-testid="review-item-summary"
          className="mt-2 text-[13.5px] text-fg-muted"
        >
          {item.summary}
        </p>
      )}

      {/* justify-between strands the link and the controls at opposite edges
          with a ragged gap once the row wraps, so the phone tier stacks it
          instead: link on its own line, controls beneath.

          Sized for FOUR controls, which is what it now holds: the View link
          plus Edit, Approve and Reject (5.4 TASK-006 landed the fourth the
          responsive pass had only simulated). */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 max-[560px]:flex-col max-[560px]:items-stretch max-[560px]:gap-3">
        <Link
          to={withReturnTo(`/recipes/${item.id}`, location)}
          className="text-[12.5px] font-bold text-accent hover:underline inline-flex items-center pointer-coarse:min-h-11"
        >
          View recipe →
        </Link>
        {confirmingReject ? (
          /* Reject is terminal — the actions row swaps in place for an
             inline confirm; no request has been made yet. */
          /* The warning is a full sentence, so on a phone it takes its own
             line above the two buttons rather than competing with them for
             335px. Button order is unchanged: "Keep" stays last, which in a
             column puts the safe choice nearest the thumb. */
          <div className="flex flex-wrap items-center justify-end gap-3 max-[560px]:flex-col max-[560px]:items-stretch">
            <p className="text-[12.5px] font-semibold text-danger">
              Rejecting is permanent — recovery is reprocessing the whole book.
            </p>
            <button
              type="button"
              disabled={decide.isPending}
              onClick={() => decide.mutate("rejected")}
              className="rounded-pill bg-danger px-4 py-[7px] text-[12.5px] font-bold pointer-coarse:min-h-11 text-fg-on-accent transition-colors hover:bg-danger/85 disabled:opacity-50"
            >
              Reject item
            </button>
            <button
              type="button"
              disabled={decide.isPending}
              onClick={() => setConfirmingReject(false)}
              className="rounded-pill border border-border bg-transparent px-4 py-[7px] text-[12.5px] font-bold pointer-coarse:min-h-11 text-fg-muted transition-colors hover:bg-accent-fill disabled:opacity-50"
            >
              Keep
            </button>
          </div>
        ) : (
          /* Edit + Approve + Reject stay side by side even on a phone —
             together they measure ~205px, and with the View link on its own
             line above they are still inside 335px. */
          <div className="flex items-center gap-2 max-[560px]:justify-end">
            {/* First in the cluster, and a <Link> rather than a <button>:
                it navigates, so middle-click, ⌘-click and the queue's own
                focus ring all keep working. `withReturnTo(location)` is the
                same call the View link makes one line up — the queue's whole
                URL (`?document=` and any `?from=` of its own) rides along, so
                the editor's BackLink says "← Back to review queue" with no
                navigation code here at all.

                Deliberately NOT disabled while a decision is pending: leaving
                an in-flight approve is the reviewer's business, and the
                optimistic removal unmounts this card anyway. Neutral outline,
                so the danger outline stays unique to Reject. */}
            <Link
              to={withReturnTo(`/recipes/${item.id}/edit`, location)}
              className="inline-flex items-center rounded-pill border border-border bg-transparent px-4 py-[7px] text-[12.5px] font-bold pointer-coarse:min-h-11 text-fg-muted transition-colors hover:text-fg"
            >
              Edit
            </Link>
            <button
              type="button"
              disabled={decide.isPending}
              onClick={() => decide.mutate("approved")}
              className="rounded-pill bg-success-fill px-4 py-[7px] text-[12.5px] font-bold pointer-coarse:min-h-11 text-success transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={decide.isPending}
              onClick={() => setConfirmingReject(true)}
              className="rounded-pill border border-danger-border bg-transparent px-4 py-[7px] text-[12.5px] font-bold pointer-coarse:min-h-11 text-danger transition-colors hover:bg-danger-fill disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>
      {decisionError && (
        /* BookRow's error idiom — announced, danger-toned, message verbatim. */
        <p
          role="alert"
          className="mt-2 text-[12.5px] font-semibold text-danger"
        >
          {decisionError}
        </p>
      )}
    </article>
  );
}
