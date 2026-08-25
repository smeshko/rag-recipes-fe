import type { ApiError } from "../../api";
import { Panel } from "../../ui";

/* The /favourites states ladder. Same chrome as the review queue's: rows in
   the skeleton because this is a vertical list, and the error box copies
   `ReviewError` shape-for-shape with the backend's message under
   role="alert". */

export function FavouritesSkeleton() {
  return (
    <div data-testid="favourites-skeleton" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="mb-4 h-[88px] animate-pulse rounded-[18px] border border-border bg-surface-raised/70"
        />
      ))}
    </div>
  );
}

export function FavouritesError({
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

export function FavouritesEmpty() {
  return (
    <Panel className="text-center">
      <p className="font-display text-[18px] font-semibold">
        Nothing saved yet.
      </p>
      {/* Says where the star IS, not just that the list is empty: the whole
          gesture is invisible until someone has seen one. */}
      <p className="mt-1 text-[13.5px] text-fg-muted">
        Star a recipe from a search result, a book's contents or its own page
        and it will be waiting here.
      </p>
    </Panel>
  );
}
