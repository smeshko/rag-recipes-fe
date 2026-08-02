import type { ApiError } from "../../api";
import { Panel } from "../../ui";

/* The /review states ladder chrome. Skeleton rows are BookRow-shaped (the
   queue is a vertical list, like the shelf); the error box copies
   SearchError's shape with the message under role="alert". */

export function ReviewSkeleton() {
  return (
    <div data-testid="review-skeleton" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="mb-4 h-[88px] animate-pulse rounded-[18px] border border-border bg-surface-raised/70"
        />
      ))}
    </div>
  );
}

export function ReviewError({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto mt-8 max-w-[560px] rounded-[20px] border border-danger-border bg-danger-fill px-7 py-6 text-center">
      <p role="alert" className="text-[15px] font-semibold text-danger">
        {error.message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-pill bg-danger px-5 py-2 text-[13px] font-bold text-fg-on-accent transition-opacity hover:opacity-90 pointer-coarse:min-h-11"
      >
        Try again
      </button>
    </div>
  );
}

export function ReviewEmptyFiltered({ onClear }: { onClear: () => void }) {
  return (
    <Panel className="text-center">
      <p className="font-display text-[18px] font-semibold">
        Nothing to review for this book.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 inline-flex items-center text-[12.5px] font-bold text-accent hover:underline pointer-coarse:min-h-11"
      >
        See the whole queue
      </button>
    </Panel>
  );
}

export function ReviewEmptyAll() {
  return (
    <Panel className="text-center">
      <p className="font-display text-[18px] font-semibold">
        Nothing waiting for review.
      </p>
      <p className="mt-1 text-[13.5px] text-fg-muted">
        Flagged extractions will land here when a book needs a human eye.
      </p>
    </Panel>
  );
}
