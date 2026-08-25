import type { ReviewFlag, ReviewThresholds } from "../../api";

/* Reviewer aids for a `needs_review` item — the FE half of the backend's
   `value` / `threshold` / `ingredient_positions` on a `ReviewFlag` and the
   item-level `review_thresholds`.

   The rule: the FE marks, the backend judges. Every "is this low?" here is a
   comparison against a number the backend shipped in the same payload, so a
   changed `Settings` threshold moves the marks without a FE release, and an
   item with no thresholds on the wire (a decided one, or an older backend)
   shows no marks at all rather than marks against an invented bound. */

export const formatScore = (score: number) => score.toFixed(2);

/** True when both sides are real numbers and the score sits under the bound.
    Strict `<` to match `validate_soft`: a score AT the threshold passes. */
export function isBelow(
  score: unknown,
  threshold: number | null | undefined,
): score is number {
  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    typeof threshold === "number" &&
    score < threshold
  );
}

/** The ingredient rows the backend named on `low_normalization_confidence`
    flags, keyed the way `ingredientLines` keys them (declared position, else
    payload index). Empty when nothing is flagged or the aid is absent. */
export function flaggedIngredientPositions(flags: ReviewFlag[]): Set<number> {
  const positions = new Set<number>();
  for (const flag of flags) {
    if (flag.code !== "low_normalization_confidence") {
      continue;
    }
    for (const position of flag.ingredient_positions ?? []) {
      positions.add(position);
    }
  }
  return positions;
}

/** The score line rendered under a flag's message: the observed value against
    the current bound, plus how many ingredient rows were marked for the
    normalization flag. `null` when the flag carries no aid, so the callout
    renders exactly what it did before the aids existed. */
export function flagDetail(flag: ReviewFlag): string | null {
  const parts: string[] = [];
  if (typeof flag.value === "number") {
    parts.push(
      typeof flag.threshold === "number"
        ? `${formatScore(flag.value)} — threshold ${formatScore(flag.threshold)}`
        : formatScore(flag.value),
    );
  }
  const marked = flag.ingredient_positions?.length ?? 0;
  if (marked > 0) {
    parts.push(
      marked === 1
        ? "1 ingredient marked below"
        : `${marked} ingredients marked below`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** A shared shape for the per-line and per-field marks: the score to show and
    the bound it fell under, or `null` for "not low / not judgeable". */
export interface LowMark {
  score: number;
  threshold: number;
}

export function lowMark(
  score: unknown,
  threshold: number | null | undefined,
): LowMark | null {
  return isBelow(score, threshold)
    ? { score, threshold: threshold as number }
    : null;
}

/** Which of the item's top-level `confidence.fields` are under the overall
    bound — title, summary, yield are the ones with a surface to mark. */
export function lowFields(
  fields: Record<string, number> | null | undefined,
  thresholds: ReviewThresholds | null | undefined,
): Record<string, LowMark> {
  const out: Record<string, LowMark> = {};
  if (!fields || !thresholds) {
    return out;
  }
  for (const [name, score] of Object.entries(fields)) {
    const mark = lowMark(score, thresholds.overall);
    if (mark) {
      out[name] = mark;
    }
  }
  return out;
}
