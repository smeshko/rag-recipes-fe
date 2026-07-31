import type { ItemConfidence, RecipeStructuredData } from "../../api";
import { Panel } from "../../ui";

export function MethodPanel({
  sd,
  status,
  confidence,
}: {
  sd: RecipeStructuredData;
  status: string;
  confidence: ItemConfidence | null;
}) {
  /* `text` and `step_number` are both optional on the verbatim-dict type.
     Drop textless rows before counting so the subheader can't promise steps
     it renders blank, and number by render position when the payload omits
     step_number — a bare "." helps nobody. */
  const steps = (sd.steps ?? [])
    .filter((step) => Boolean(step.text))
    .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0))
    /* Row identity is resolved here rather than in the JSX: step_number is
       optional and repeatable, so render position is the only unique key
       available, and the list is built once per payload and never reordered. */
    .map((step, index) => ({
      key: `${index}:${step.step_number ?? ""}`,
      number: step.step_number ?? index + 1,
      text: step.text,
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
        <p className="mt-3 text-[13.5px] text-ink-faint italic">
          {status === "extracting"
            ? "Still being extracted…"
            : "No structured method was extracted."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12.5px] text-ink-faint">
            {steps.length} steps{fragment}
          </p>
          <ol className="mt-4 flex flex-col gap-4">
            {steps.map((step) => (
              <li key={step.key} className="grid grid-cols-[40px_1fr] gap-1">
                <span className="font-display text-[17px] font-semibold text-apricot italic">
                  {step.number}.
                </span>
                <span className="text-[15px] leading-[1.65] text-ink">
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
