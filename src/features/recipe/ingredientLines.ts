import type { RecipeStructuredData } from "../../api";

export type IngredientResolution =
  | { kind: "structured"; lines: string[] }
  | { kind: "text"; lines: string[] }
  | { kind: "empty" };

/* Array-or-text-or-empty resolution, verbatim per D4: structured rows sort
   by declared position; the text fallback splits lines and drops empties. */
export function ingredientLines(
  sd: RecipeStructuredData,
): IngredientResolution {
  const structured = (sd.ingredients ?? [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((ing) => ing.raw_text)
    .filter((text): text is string => Boolean(text));
  if (structured.length > 0) {
    return { kind: "structured", lines: structured };
  }
  const text = (sd.ingredients_text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (text.length > 0) {
    return { kind: "text", lines: text };
  }
  return { kind: "empty" };
}
