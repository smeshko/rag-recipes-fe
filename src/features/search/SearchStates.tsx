import type { ApiError } from "../../api";

export function SearchSkeleton() {
  return (
    <div
      data-testid="search-skeleton"
      aria-hidden="true"
      className="mt-14 grid grid-cols-3 gap-[22px] max-[960px]:grid-cols-1"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
          key={i}
          className="h-[220px] overflow-hidden rounded-card border border-border bg-surface-raised p-4"
        >
          {/* A short bar for the book label, not the full-bleed tinted band
              this used to open with: Card's header is small caps ink inside
              the card's own padding now, with no fill behind it. */}
          <div className="h-3 w-24 rounded-reco bg-skeleton" />
          <div className="mt-5 space-y-3">
            <div className="h-4 w-3/4 rounded-reco bg-skeleton" />
            <div className="h-3 w-full rounded-reco bg-skeleton" />
            <div className="h-3 w-2/3 rounded-reco bg-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchEmpty() {
  return (
    <div className="mt-16 text-center">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em]">
        The shelf has nothing for that.
      </h2>
      <p className="mt-2.5 text-[14px] text-fg-muted">
        Try fewer words, or a different craving.
      </p>
    </div>
  );
}

export function SearchError({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto mt-16 max-w-[560px] rounded-panel border border-danger-border bg-danger-fill px-6 py-5 text-center">
      <p className="text-[15px] font-semibold text-danger">{error.message}</p>
      <button
        type="button"
        onClick={onRetry}
        /* Same danger solid as AnswerError's retry — the two failures on this
           screen must not offer differently-weighted ways out. */
        className="mt-4 rounded-pill bg-danger px-5 py-2 text-[13px] font-medium pointer-coarse:min-h-11 text-fg-on-accent transition-opacity hover:opacity-80"
      >
        Try again
      </button>
    </div>
  );
}
