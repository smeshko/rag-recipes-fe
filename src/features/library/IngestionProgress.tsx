import type {
  DocumentStatus,
  IngestionStatusResponse,
  IngestionStopReason,
} from "../../api";
import { PIPELINE_STAGES, stageLabel, stageStates } from "./stages";

export interface IngestionProgressProps {
  /** The list status — renders the stepper before the first poll lands. */
  fallbackStatus: DocumentStatus;
  data: IngestionStatusResponse | undefined;
  stopReason: IngestionStopReason;
  checkAgain: () => void;
}

/* A stop with no explanation looks identical to a frozen UI — every
   degraded stop names itself and offers the way back. */
const STOP_COPY: Record<"error" | "stalled", string> = {
  error: "Couldn't reach the shelf — check again.",
  stalled: "Still working — taking longer than expected.",
};

function StopNotice({
  reason,
  checkAgain,
}: {
  reason: "error" | "stalled";
  checkAgain: () => void;
}) {
  return (
    <div role="status" className="mt-2 text-[12.5px] text-fg-muted">
      {STOP_COPY[reason]}{" "}
      <button
        type="button"
        onClick={checkAgain}
        className="font-bold text-accent hover:underline inline-flex items-center pointer-coarse:min-h-11"
      >
        Check again
      </button>
    </div>
  );
}

/**
 * The mockup's processing variant (design/sk-library.html): progress label
 * row, 8px shimmer bar, seven-stage stepper. `pages_total: null` renders
 * the numberless indeterminate treatment — true both for early stages and
 * for a reuse-mode reprocess, which reports (0, null) for its whole run.
 */
export function IngestionProgress({
  fallbackStatus,
  data,
  stopReason,
  checkAgain,
}: IngestionProgressProps) {
  const status = data?.status ?? fallbackStatus;
  const pagesTotal = data?.progress.pages_total ?? null;
  const pagesProcessed = data?.progress.pages_processed ?? 0;
  const determinate = pagesTotal !== null && pagesTotal > 0;

  /* The ratio is NOT guaranteed ≤ 1 — pages_processed is a span count while
     pages_total is max(page_end), two different quantities. Clamp. */
  const fillPct = determinate
    ? Math.min(100, Math.max(0, (pagesProcessed / pagesTotal) * 100))
    : 100;

  const states = stageStates(status);

  return (
    <div className="py-5 max-[880px]:col-start-2 max-[880px]:pt-0 max-[880px]:pr-6 max-[880px]:pb-5">
      <div className="mb-2 flex justify-between text-[12.5px] font-semibold text-fg-muted">
        <span>{stageLabel(status)}</span>
        {determinate && (
          <b className="text-accent">
            {pagesProcessed} / {pagesTotal} pages
          </b>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Ingestion progress"
        {...(determinate
          ? {
              "aria-valuemin": 0,
              "aria-valuenow": pagesProcessed,
              "aria-valuemax": pagesTotal,
            }
          : {})}
        className="h-2 overflow-hidden rounded-[4px] border border-border bg-surface-inset"
      >
        <span
          data-testid="progress-fill"
          className={`progress-fill block h-full rounded-[4px] ${
            determinate ? "" : "opacity-40"
          }`}
          style={{
            width: `${fillPct}%`,
            background: "var(--gradient-progress)",
          }}
        />
      </div>
      <ol
        aria-label="Ingestion stages"
        /* Seven stages (stages.ts), each with a possible ✓ or ● marker, plus
           six gaps — it does not fit 335px on one line, so it wraps rather
           than pushing the row wide. */
        className="mt-2.5 flex list-none flex-wrap gap-x-1.5 gap-y-1 text-[10.5px] font-bold tracking-[0.04em] text-fg-subtle uppercase"
      >
        {PIPELINE_STAGES.map((stage, index) => {
          const state = states[index];
          return (
            <li
              key={stage.status}
              {...(state === "now" ? { "aria-current": "step" } : {})}
              className={`flex items-center gap-1 ${
                state === "now" ? "text-accent" : ""
              } ${state === "pending" ? "opacity-60" : ""}`}
            >
              {state === "done" && (
                <span aria-hidden="true" className="text-success">
                  ✓
                </span>
              )}
              {state === "now" && (
                <span aria-hidden="true" className="progress-blinkdot">
                  ●
                </span>
              )}
              {stage.label}
            </li>
          );
        })}
      </ol>
      {(stopReason === "error" || stopReason === "stalled") && (
        <StopNotice reason={stopReason} checkAgain={checkAgain} />
      )}
    </div>
  );
}
