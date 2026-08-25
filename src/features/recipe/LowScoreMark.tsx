import type { LowMark } from "./reviewMarks";
import { formatScore } from "./reviewMarks";

/** The one visual for "this line/field scored under the bound": a small
    warning pill carrying the score, with the bound in its tooltip. Inline so
    it sits after a title, a fact, a step or an ingredient line alike. */
export function LowScoreMark({
  mark,
  label,
  testId,
}: {
  mark: LowMark;
  /** What was scored — "normalization", "step", "title" — for the tooltip and
      the accessible name. */
  label: string;
  testId: string;
}) {
  const title = `${label} confidence ${formatScore(mark.score)} — below the ${formatScore(mark.threshold)} threshold`;
  return (
    <span
      data-testid={testId}
      data-score={formatScore(mark.score)}
      title={title}
      role="img"
      aria-label={title}
      className="ml-2 inline-flex items-center rounded-pill border border-warning-border bg-warning-fill px-1.5 py-px align-middle font-mono text-[11px] font-medium text-warning"
    >
      {formatScore(mark.score)}
    </span>
  );
}
