import type { CardAccent } from "../../ui";

const ACCENTS: CardAccent[] = ["terra", "sage", "butter"];

/* Stable book→accent mapping: hash the id string, not its position, so the
   same book keeps its accent across renders and result orderings. Distinct
   accents per book are NOT guaranteed — three accents collide by pigeonhole
   once the shelf grows. */
export function accentFor(documentId: string): CardAccent {
  let sum = 0;
  for (let i = 0; i < documentId.length; i += 1) {
    sum = (sum + documentId.charCodeAt(i)) % 3;
  }
  return ACCENTS[sum] as CardAccent;
}
