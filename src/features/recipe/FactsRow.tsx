import type { RecipeStructuredData } from "../../api";

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

export function FactsRow({ sd }: { sd: RecipeStructuredData }) {
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
        </div>
      ))}
    </div>
  );
}
