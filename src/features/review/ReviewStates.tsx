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
          className="mb-4 h-[88px] animate-pulse rounded-[18px] border border-line bg-card/70"
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
    <div className="mx-auto mt-8 max-w-[560px] rounded-[20px] border border-danger-line bg-danger-soft px-7 py-6 text-center">
      <p role="alert" className="text-[15px] font-semibold text-danger">
        {error.message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-pill bg-danger px-5 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}

export function ReviewEmptyAll() {
  return (
    <Panel className="text-center">
      <p className="font-display text-[18px] font-semibold">
        Nothing waiting for review.
      </p>
      <p className="mt-1 text-[13.5px] text-ink-soft">
        Flagged extractions will land here when a book needs a human eye.
      </p>
    </Panel>
  );
}
