import { Fragment } from "react";
import type { RecipeStructuredData } from "../../api";
import { LowScoreMark } from "./LowScoreMark";
import type { LowMark } from "./reviewMarks";

interface Fact {
  label: string;
  value: string;
}

function facts(sd: RecipeStructuredData): Fact[] {
  const list: Fact[] = [];
  if (sd.yield) {
    list.push({ label: "Serves", value: sd.yield });
  }
  if (sd.total_time) {
    list.push({ label: "Total", value: sd.total_time });
  } else {
    if (sd.prep_time) {
      list.push({ label: "Prep", value: sd.prep_time });
    }
    if (sd.cook_time) {
      list.push({ label: "Cook", value: sd.cook_time });
    }
  }
  return list;
}

/* Case-insensitive, and anchored: "Serves 2" opens with "Serves", but a
   "Total" of "Total time 40 min" should also collapse, while a `cook_time` of
   "Cooked overnight" under a "Cook" label legitimately keeps its label. */
function startsWithLabel(fact: Fact): boolean {
  return fact.value.toLowerCase().startsWith(fact.label.toLowerCase());
}

/* One subtle line, dot-separated — not a row of bordered boxes.
 *
 * These values come out of extraction and are free-form: `yield` is as likely
 * to be "Varies depending on the size of the bird" as "Serves 4", and
 * `cook_time` runs to "About 1 hour 15 minutes (about 45 minutes at 400°F
 * [200°C] plus about 30 minutes at 325°F [165°C])". Boxed, each one became a
 * full-width lozenge and two facts filled a third of the screen above the
 * recipe. A box is the wrong shape for a sentence.
 *
 * The same reasoning retired the pills on the search cards, and it is what
 * every comparable recipe surface does (Julienne, Blue Apron, Instacart,
 * Walmart all set time and servings as plain meta text). The label is the
 * quiet half and the value the loud one, which is the only hierarchy this
 * needs. */
export function FactsRow({
  sd,
  yieldMark = null,
}: {
  sd: RecipeStructuredData;
  /** The `fields.yield` low mark, when the extractor doubted its own serving
      count — the only fact the schema scores. */
  yieldMark?: LowMark | null;
}) {
  const list = facts(sd);
  if (list.length === 0) {
    return null;
  }
  return (
    <p className="mt-4 text-[14px] text-fg">
      {list.map((fact, index) => (
        <Fragment key={fact.label}>
          {index > 0 ? (
            <span aria-hidden="true" className="text-fg-subtle">
              {" · "}
            </span>
          ) : null}
          {/* Dropped when the value already opens with it: the extractor
              writes `yield` as "Serves 2", which paired with a "Serves" label
              printed "Serves Serves 2" on every recipe that had one. */}
          {startsWithLabel(fact) ? null : (
            <>
              <span className="text-fg-subtle">{fact.label}</span>{" "}
            </>
          )}
          <span>{fact.value}</span>
          {fact.label === "Serves" && yieldMark ? (
            <LowScoreMark mark={yieldMark} label="Yield" testId="yield-score" />
          ) : null}
        </Fragment>
      ))}
    </p>
  );
}
