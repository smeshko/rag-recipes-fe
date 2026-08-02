import type { RecipeStructuredData, Step } from "../../api";

export interface StepLine {
  number: number;
  text: string;
}

/* The method's ordering and numbering rules, lifted out of `MethodPanel` so
   read mode and edit mode seed from one resolver — the shape `ingredientLines`
   established. Behaviour-preserving: the commentary below is the original,
   because it is the reason the rules look odd. */
export function stepLines(sd: RecipeStructuredData): StepLine[] {
  /* `text` and `step_number` are both optional on the verbatim-dict type.
     Textless rows are dropped before counting, so the subheader can't promise
     steps it then renders blank. The predicate is explicit because
     `Boolean(step.text)` is not a type guard, and the return type promises a
     `string`. */
  const retained = (sd.steps ?? []).filter(
    (step): step is Step & { text: string } => Boolean(step.text),
  );

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

  return ordered.map((step, index) => ({
    number: trustNumbering ? (step.step_number as number) : index + 1,
    text: step.text,
  }));
}
