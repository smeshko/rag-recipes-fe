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
    <div className="mt-6 flex flex-wrap gap-3">
      {list.map((fact) => (
        <div
          key={fact.label}
          className="rounded-[12px] border border-border bg-surface-raised px-4 py-2.5 text-[13px] shadow-card"
        >
          <span className="font-bold tracking-[0.06em] text-fg-subtle uppercase">
            {fact.label}
          </span>{" "}
          <span className="font-semibold text-fg">{fact.value}</span>
          {fact.label === "Serves" && yieldMark ? (
            <LowScoreMark mark={yieldMark} label="Yield" testId="yield-score" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
