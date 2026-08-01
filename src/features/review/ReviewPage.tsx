import { useSearchParams } from "react-router";
import { type ApiError, useReviewItems } from "../../api";
import { Bloom } from "../../ui";
import { FilterChip } from "./FilterChip";
import { ReviewItemCard } from "./ReviewItemCard";
import {
  ReviewEmptyAll,
  ReviewEmptyFiltered,
  ReviewError,
  ReviewSkeleton,
} from "./ReviewStates";

/* The global review queue (phase 4.3), running on 4.2's hooks. Bloom cadence
   copies the library page: head 0.06, chip 0.10, list items base .18 step .04.

   ?document=<id> narrows the queue to one book. The URL is the single source
   of truth (SearchPage's pattern): the id is derived every render, never
   mirrored into local state, and the chip is derived UI on top of it. */

export function ReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const documentId = searchParams.get("document") ?? undefined;
  const items = useReviewItems(documentId);
  const flagged = items.data?.review_items ?? [];

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
      <Bloom duration={0.7} delay={0.06} className="pt-10 pb-2">
        <h1 className="font-display text-[clamp(30px,4vw,40px)] font-medium">
          Needs a <em className="text-apricot italic">second look.</em>
        </h1>
        <div className="mt-2 text-[15px] text-ink-soft">{countLine}</div>
      </Bloom>

      {documentId && (
        <Bloom duration={0.7} delay={0.1} className="mt-4">
          <FilterChip documentId={documentId} onClear={clearFilter} />
        </Bloom>
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

        {flagged.map((item, index) => (
          <Bloom
            key={item.id}
            index={index}
            base={0.18}
            step={0.04}
            className="mb-4"
          >
            <ReviewItemCard item={item} />
          </Bloom>
        ))}
      </div>
    </div>
  );
}
