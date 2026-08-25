import type { Ingredient, RecipeStructuredData } from "../../api";

/** One rendered structured row: the parse it came from and the position the
    backend addresses it by in `ReviewFlag.ingredient_positions` — the row's
    declared `position`, else its index in the payload array, which is the
    same fallback `build_review_reasons` applies. */
export interface IngredientRow {
  ingredient: Ingredient;
  position: number;
}

export type IngredientResolution =
  | { kind: "structured"; lines: string[]; rows: IngredientRow[] }
  | { kind: "text"; lines: string[] }
  | { kind: "empty" };

/* Array-or-text-or-empty resolution, verbatim per D4: structured rows sort
   by declared position; the text fallback splits lines and drops empties. */
export function ingredientLines(
  sd: RecipeStructuredData,
): IngredientResolution {
  const rows = (sd.ingredients ?? [])
    .map((ingredient, index) => ({
      ingredient,
      position: ingredient.position ?? index,
    }))
    .sort((a, b) => (a.ingredient.position ?? 0) - (b.ingredient.position ?? 0))
    .filter((row) => Boolean(row.ingredient.raw_text));
  const structured = rows.map((row) => row.ingredient.raw_text as string);
  if (structured.length > 0) {
    return { kind: "structured", lines: structured, rows };
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
