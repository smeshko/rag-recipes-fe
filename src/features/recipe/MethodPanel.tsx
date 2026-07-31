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
     Textless rows are dropped before counting, so the subheader can't promise
     steps it then renders blank. */
  const retained = (sd.steps ?? []).filter((step) => Boolean(step.text));

  /* Trust the payload's numbering only when it is wholly trustworthy: every
     retained step numbered, finite, and distinct. Sorting a partially numbered
     list would silently REORDER the method — [1, null, 2] sorts the unnumbered
     step to the front — and that is a worse failure than ignoring the numbers,
     because a reordered recipe still looks authoritative. When the numbering
     is incomplete or repeats, keep arrival order and number sequentially. */
  const numbers = retained.map((step) => step.step_number);
  const trustNumbering =
    /* Positive integers only. The backend's model types step_number as a bare
       int with no lower bound and soft validation never rejects one, so 0, -1
       and 2.5 can all reach us through a clean model_dump — and sorting on a
       malformed ordinal reorders the method ([-1, 2, 1]) while rendering it as
       an authoritative "-1.". Gaps ARE trusted: a payload numbered [1, 2, 4]
       most likely lost step 3 in extraction, and renumbering it to 1-2-3 would
       erase the only evidence the reader has of the omission. */
    numbers.every(
      (n) => typeof n === "number" && Number.isInteger(n) && n > 0,
    ) && new Set(numbers).size === numbers.length;

  const ordered = trustNumbering
    ? [...retained].sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0))
    : retained;

  /* Row identity is resolved here rather than in the JSX: step_number is
     optional and repeatable, so render position is the only unique key
     available, and the list is built once per payload and never reordered. */
  const steps = ordered.map((step, index) => ({
    key: `${index}:${step.step_number ?? ""}`,
    number: trustNumbering ? step.step_number : index + 1,
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
