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
          className="h-[220px] animate-pulse overflow-hidden rounded-card border border-border bg-surface-raised"
        >
          <div className="h-10 bg-skeleton/60" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-3/4 rounded bg-skeleton/60" />
            <div className="h-3 w-full rounded bg-skeleton/40" />
            <div className="h-3 w-2/3 rounded bg-skeleton/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchEmpty() {
  return (
    <div className="mt-16 text-center">
      <h2 className="font-display text-[27px] font-semibold">
        The shelf has nothing for that.
      </h2>
      <p className="mt-2.5 text-[15px] text-fg-muted">
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
    <div className="mx-auto mt-16 max-w-[560px] rounded-[20px] border border-danger-border bg-danger-fill px-7 py-6 text-center">
      <p className="text-[15px] font-semibold text-danger">{error.message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-pill bg-danger px-5 py-2 text-[13px] font-bold pointer-coarse:min-h-11 text-fg-on-accent transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
