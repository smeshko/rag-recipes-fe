import type { ItemConfidence, RecipeStructuredData } from "../../api";
import { Panel } from "../../ui";
import { stepLines } from "./stepLines";

export function MethodPanel({
  sd,
  status,
  confidence,
}: {
  sd: RecipeStructuredData;
  status: string;
  confidence: ItemConfidence | null;
}) {
  /* Ordering and numbering live in `stepLines` (5.3 D6), shared with the edit
     form so the two surfaces can never disagree about what the method is.

     Row identity is resolved here rather than in the JSX: step_number is
     optional and repeatable, so render position is the only unique key
     available, and the list is built once per payload and never reordered. */
  const steps = stepLines(sd).map((step, index) => ({
    key: `${index}:${step.number}`,
    ...step,
  }));
  const overall = confidence?.overall;
  const fragment =
    typeof overall === "number"
      ? ` · extracted with ${overall.toFixed(2)} confidence`
      : "";

  return (
    <Panel>
      <h2 className="font-display text-[19px] font-semibold">Method</h2>
      {steps.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-fg-subtle italic">
          {status === "extracting"
            ? "Still being extracted…"
            : "No structured method was extracted."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12.5px] text-fg-subtle">
            {steps.length} steps{fragment}
          </p>
          <ol className="mt-4 flex flex-col gap-4">
            {steps.map((step) => (
              <li key={step.key} className="grid grid-cols-[40px_1fr] gap-1">
                <span className="font-display text-[17px] font-semibold text-accent italic">
                  {step.number}.
                </span>
                <span className="text-[15px] leading-[1.65] text-fg">
                  {step.text}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}
