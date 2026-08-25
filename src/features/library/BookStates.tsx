import { Link } from "react-router";
import type { ApiError } from "../../api";
import { Panel } from "../../ui";

/* The /library/:documentId states ladder. Deliberately the same chrome as
   ReviewStates — same skeleton height, same danger box, same centred Panel for
   the empty arms — because the two screens are the same shape (a vertical list
   of recipe cards) and a reader moving between them should not notice a
   restyle. Kept as its own module rather than shared with the queue: the copy
   differs on every arm, and a shared component parameterised by four strings
   would be harder to read than this. */

export function BookSkeleton() {
  return (
    <div data-testid="book-skeleton" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="mb-4 h-[88px] animate-pulse rounded-card border border-border bg-surface-raised/70"
        />
      ))}
    </div>
  );
}

export function BookError({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto mt-8 max-w-[560px] rounded-panel border border-danger-border bg-danger-fill px-7 py-6 text-center">
      {/* The house rule: backend copy verbatim, no FE code→message table. */}
      <p role="alert" className="text-[15px] font-semibold text-danger">
        {error.message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-pill bg-danger px-5 py-2 text-[13px] font-medium text-fg-on-accent transition-opacity hover:opacity-80 pointer-coarse:min-h-11"
      >
        Try again
      </button>
    </div>
  );
}

/** The book itself is unknown — a stale bookmark, or a book someone deleted. */
export function BookNotFound() {
  return (
    <Panel className="text-center">
      <p className="text-[15px] font-semibold">
        That book is not on the shelf.
      </p>
      <p className="mt-1 text-[14px] text-fg-muted">
        It may have been removed since this link was made.
      </p>
      <Link
        to="/library"
        className="mt-3 inline-flex items-center text-[13px] font-medium text-accent hover:underline pointer-coarse:min-h-11"
      >
        Back to the shelf
      </Link>
    </Panel>
  );
}

export function BookEmptyFiltered({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <Panel className="text-center">
      <p className="text-[15px] font-semibold">
        Nothing in this book is {label.toLowerCase()}.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 inline-flex items-center text-[13px] font-medium text-accent hover:underline pointer-coarse:min-h-11"
      >
        See every recipe
      </button>
    </Panel>
  );
}

export function BookEmptyAll() {
  return (
    <Panel className="text-center">
      <p className="text-[15px] font-semibold">
        No recipes came out of this book.
      </p>
      <p className="mt-1 text-[14px] text-fg-muted">
        Reprocessing it from the shelf is the way to try the extraction again.
      </p>
    </Panel>
  );
}
