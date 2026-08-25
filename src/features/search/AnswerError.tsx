import type { ApiError } from "../../api";

/* Danger-toned and role="alert" — semantically distinct from the fallback,
   which is content. The search grid stays rendered alongside. */
export function AnswerError({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto mt-10 flex max-w-[720px] flex-wrap items-center justify-between gap-3 rounded-reco border border-danger-border bg-danger-fill px-5 py-4"
    >
      <p className="text-[14px] font-semibold text-danger">{error.message}</p>
      <button
        type="button"
        onClick={onRetry}
        /* The danger solid, not the black one: this is the one action on the
           page whose colour is carrying meaning rather than emphasis. */
        className="rounded-pill bg-danger px-4 py-1.5 pointer-coarse:min-h-11 text-[13px] font-medium text-fg-on-accent transition-opacity hover:opacity-80"
      >
        Try again
      </button>
    </div>
  );
}
