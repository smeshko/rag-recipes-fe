import { useState } from "react";
import { useSearchParams } from "react-router";
import { type ApiError, useReviewItems } from "../../api";
import { BackLink, readReturnTo } from "../../ui";
import { FilterChip } from "./FilterChip";
import { ReviewItemCard } from "./ReviewItemCard";
import {
  ReviewEmptyAll,
  ReviewEmptyFiltered,
  ReviewError,
  ReviewSkeleton,
} from "./ReviewStates";

/* The global review queue (phase 4.3), running on 4.2's hooks.

   ?document=<id> narrows the queue to one book. The URL is the single source
   of truth (SearchPage's pattern): the id is derived every render, never
   mirrored into local state, and the chip is derived UI on top of it. */

export function ReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  /* `||`, not `??`: a hand-typed `?document=` (empty string) must mean "no
     filter" end-to-end — otherwise the UI goes unfiltered (no chip, all-empty
     state) while the request still carries a literal `document_id=` and the
     cache mints a phantom ["review-items", ""] entry (review #1.1). */
  const documentId = searchParams.get("document") || undefined;
  const items = useReviewItems(documentId);
  const flagged = items.data?.review_items ?? [];

  /* The queue is the one screen that must NOT degrade to "← Back to Cook":
     a bookmarked or hand-typed /review would otherwise grow a prominent link
     dumping the reviewer on the search page — the very failure this contract
     exists to fix, newly installed on a page that never had a back link.
     So it is guarded here rather than in BackLink, whose four-arm degrade is
     right for /recipes/:id. */
  const returnTarget = readReturnTo(searchParams);

  /* Decision failures, keyed by item id (TASK-004). A failed decision
     optimistically UNMOUNTS the card and rolls it back, so the message must
     outlive the card's own state to survive the rollback re-render — it
     lives here and travels down as props. */
  const [decisionErrors, setDecisionErrors] = useState<Record<string, string>>(
    {},
  );
  const recordDecisionError = (itemId: string, message: string | null) => {
    setDecisionErrors((previous) => {
      if (message === null) {
        if (!(itemId in previous)) return previous;
        const next = { ...previous };
        delete next[itemId];
        return next;
      }
      return { ...previous, [itemId]: message };
    });
  };

  /* One clear callback, handed to both the chip and the filtered-empty
     state. Functional updater so unknown params survive the delete —
     `writeParams`' discipline in SearchPage. */
  const clearFilter = () => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.delete("document");
      return params;
    });
  };

  /* LibraryPage's statsLine discipline: an em-dash placeholder until the
     list settles successfully — an outage is not "0 flagged". */
  const countLine = `${
    items.isSuccess ? flagged.length : "—"
  } flagged during extraction · approve or reject to settle them`;

  return (
    <div>
      {returnTarget !== null && (
        <div className="pt-8">
          <BackLink />
        </div>
      )}
      {/* The back link takes the head's top padding over, so the queue's
          total top spacing stays 40px either way — padding moved between two
          stacked elements, not a restyle. */}
      <div className={`${returnTarget === null ? "pt-10" : "pt-2"} pb-2`}>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          Needs a second look.
        </h1>
        <div className="mt-2 text-[15px] text-fg-muted">{countLine}</div>
      </div>

      {documentId && (
        <div className="mt-4">
          <FilterChip documentId={documentId} onClear={clearFilter} />
        </div>
      )}

      <div className="mt-9">
        {items.isPending && <ReviewSkeleton />}

        {items.isError && (
          <ReviewError
            error={items.error as ApiError}
            onRetry={() => items.refetch()}
          />
        )}

        {items.isSuccess &&
          flagged.length === 0 &&
          (documentId ? (
            <ReviewEmptyFiltered onClear={clearFilter} />
          ) : (
            <ReviewEmptyAll />
          ))}

        {flagged.map((item) => (
          <div key={item.id} className="mb-4">
            <ReviewItemCard
              item={item}
              decisionError={decisionErrors[item.id]}
              onDecisionError={recordDecisionError}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
