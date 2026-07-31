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
      className="mx-auto mt-10 flex max-w-[720px] flex-wrap items-center justify-between gap-3 rounded-[14px] border border-danger-line bg-danger-soft px-5 py-4"
    >
      <p className="text-[14px] font-semibold text-danger">{error.message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-pill bg-danger px-4 py-1.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
