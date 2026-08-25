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
        /* A solid --color-skeleton block, not a hairline box with a
           near-transparent fill: on a white page `bg-surface-raised/70` IS the
           page, so the pulse had nothing to pulse and the placeholder read as
           three empty outlines. A skeleton is a stand-in for content, not a
           surface, so it takes the fill and skips the border. */
        <div
          key={i}
          className="mb-4 h-[88px] animate-pulse rounded-card bg-skeleton"
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
    <div className="mx-auto mt-8 max-w-[560px] rounded-panel border border-danger-border bg-danger-fill px-7 py-6 text-center">
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

export function FavouritesEmpty() {
  return (
    <Panel className="text-center">
      <p className="text-[18px] font-semibold tracking-[-0.01em]">
        Nothing saved yet.
      </p>
      {/* Says where the star IS, not just that the list is empty: the whole
          gesture is invisible until someone has seen one. */}
      <p className="mt-1 text-[14px] text-fg-muted">
        Star a recipe from a search result, a book's contents or its own page
        and it will be waiting here.
      </p>
    </Panel>
  );
}
