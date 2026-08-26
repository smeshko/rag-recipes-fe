/* The warning-toned fallback: content, not an alert — role="status", never
   error styling. The body is the API's own warning verbatim (answer.text is
   the same string; render it once).
   (The sk-fallback.html mockup it was drawn from is retired — see theme.css on
   the design/ folder; the tone tokens are the spec now.) */
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
    <div className="mt-14">
      <div
        role="status"
        className="flex flex-wrap items-start gap-4 rounded-panel border border-warning-border bg-warning-fill px-6 py-5"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-reco bg-warning/12"
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
          <h3 className="text-[15px] font-semibold text-warning">
            I couldn't put together a grounded answer for this one.
          </h3>
          <p className="mt-2 text-[14px] text-fg-muted">{warnings.join(" ")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {hasResults ? (
              <code className="rounded-chip bg-warning/10 px-2 py-1 text-[12px] font-medium text-warning">
                warning: answer_fallback · retrieval still ran
              </code>
            ) : null}
            <button
              type="button"
              onClick={onRephrase}
              /* Ghost button in the notice's own tone rather than the neutral
                 one: it is the only control inside a warning-coloured box, and
                 a grey chip in there reads as belonging to the page behind it.
                 Hairline, though — the old 1.5px outline was the loudest edge
                 on the screen. */
              className="rounded-pill border border-warning-border px-4 py-1.5 text-[13px] font-medium text-warning pointer-coarse:min-h-11 transition-colors hover:bg-warning/8"
            >
              Try rephrasing ↻
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
