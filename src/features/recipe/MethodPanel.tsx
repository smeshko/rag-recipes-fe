import type {
  ItemConfidence,
  RecipeStructuredData,
  ReviewThresholds,
} from "../../api";
import { Panel } from "../../ui";
import { LowScoreMark } from "./LowScoreMark";
import { lowMark } from "./reviewMarks";
import { stepLines } from "./stepLines";

export function MethodPanel({
  sd,
  status,
  confidence,
  thresholds = null,
}: {
  sd: RecipeStructuredData;
  status: string;
  confidence: ItemConfidence | null;
  /** Present only for a `needs_review` item. No backend rule fires on a single
      step, so a step mark is ADVISORY: the step's own `confidence.overall`
      judged against the item-level overall bound, to tell a reviewer where in
      the method to look first. Without thresholds nothing is marked. */
  thresholds?: ReviewThresholds | null;
}) {
  /* Ordering and numbering live in `stepLines` (5.3 D6), shared with the edit
     form so the two surfaces can never disagree about what the method is.

     Row identity is resolved here rather than in the JSX: step_number is
     optional and repeatable, so render position is the only unique key
     available, and the list is built once per payload and never reordered. */
  const steps = stepLines(sd).map((step, index) => ({
    key: `${index}:${step.number}`,
    mark: lowMark(step.confidence?.overall, thresholds?.overall),
    ...step,
  }));
  const overall = confidence?.overall;
  const fragment =
    typeof overall === "number"
      ? ` · extracted with ${overall.toFixed(2)} confidence`
      : "";

  return (
    <Panel>
      <h2 className="text-[18px] font-semibold tracking-[-0.01em]">Method</h2>
      {steps.length === 0 ? (
        /* Plain, not italic — the same fact-stating voice as the ingredients
           panel's empty arm, which sits beside it on the same row. */
        <p className="mt-3 text-[13px] text-fg-subtle">
          {status === "extracting"
            ? "Still being extracted…"
            : "No structured method was extracted."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-fg-subtle">
            {steps.length} steps{fragment}
          </p>
          <ol className="mt-4 flex flex-col gap-4">
            {steps.map((step) => (
              <li
                key={step.key}
                data-testid={step.mark ? "step-flagged" : undefined}
                className={`grid grid-cols-[40px_1fr] gap-1 ${
                  step.mark
                    ? "-ml-3 rounded-[10px] border-l-[3px] border-warning-border bg-warning-fill py-1 pl-3"
                    : ""
                }`}
              >
                {/* A plain sans numeral in subtle grey, set at the step text's
                    own size and line-height so the two share a baseline. It
                    used to be an oversized accent-blue italic — a decorated
                    numeral that outweighed the instruction beside it, and blue
                    ink on something nobody can click. */}
                <span className="text-[15px] font-semibold leading-[1.65] text-fg-subtle">
                  {step.number}.
                </span>
                <span className="text-[15px] leading-[1.65] text-fg">
                  {step.text}
                  {step.mark ? (
                    <LowScoreMark
                      mark={step.mark}
                      label="Step"
                      testId="step-score"
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}
