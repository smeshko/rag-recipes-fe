import { Bloom } from "../../ui";

/* The designed warning-toned fallback (sk-fallback.html): content, not an
   alert — role="status", never error styling. The body is the API's own
   warning verbatim (answer.text is the same string; render it once). */
export function FallbackNotice({
  warnings,
  hasResults,
  onRephrase,
}: {
  warnings: string[];
  hasResults: boolean;
  onRephrase: () => void;
}) {
  return (
    <Bloom duration={0.7} delay={0.14} className="mt-14">
      <div
        role="status"
        className="flex flex-wrap items-start gap-5 rounded-[20px] border border-warning-border bg-warning-fill px-8 py-7"
      >
        <span
          aria-hidden="true"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-warning/12"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 stroke-warning stroke-2"
            fill="none"
            aria-hidden="true"
          >
            <path d="M12 3 2.5 20h19L12 3Z" />
            <path d="M12 9v5" />
            <circle cx="12" cy="17" r="0.5" />
          </svg>
        </span>
        <div className="min-w-[260px] flex-1">
          <h3 className="font-display text-[21px] font-medium text-warning">
            I couldn't put together a grounded answer for this one.
          </h3>
          <p className="mt-2 text-[15px] text-fg-muted">{warnings.join(" ")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {hasResults ? (
              <code className="rounded-[6px] bg-warning/10 px-2 py-1 font-body text-[11.5px] font-bold text-warning">
                warning: answer_fallback · retrieval still ran
              </code>
            ) : null}
            <button
              type="button"
              onClick={onRephrase}
              className="rounded-pill border-[1.5px] border-warning-border px-4 py-1.5 text-[13.5px] font-bold text-warning pointer-coarse:min-h-11 transition-colors hover:bg-warning/8"
            >
              Try rephrasing ↻
            </button>
          </div>
        </div>
      </div>
    </Bloom>
  );
}
