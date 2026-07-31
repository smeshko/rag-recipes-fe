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
  const steps = (sd.steps ?? [])
    .slice()
    .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
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
              <li
                key={step.step_number ?? step.text}
                className="grid grid-cols-[40px_1fr] gap-1"
              >
                <span className="font-display text-[17px] font-semibold text-apricot italic">
                  {step.step_number}.
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
