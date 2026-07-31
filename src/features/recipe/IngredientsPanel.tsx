import { useState } from "react";
import type { RecipeStructuredData } from "../../api";
import { Panel } from "../../ui";
import { ingredientLines } from "./ingredientLines";

export function IngredientsPanel({
  sd,
  status,
}: {
  sd: RecipeStructuredData;
  status: string;
}) {
  const resolution = ingredientLines(sd);
  /* Purely visual; resets on navigation by design. */
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (index: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });

  return (
    <Panel className="max-[880px]:static sticky top-6 self-start">
      <h2 className="font-display text-[19px] font-semibold">Ingredients</h2>
      {resolution.kind === "empty" ? (
        <p className="mt-3 text-[13.5px] text-ink-faint italic">
          {status === "extracting"
            ? "Still being extracted…"
            : "No ingredients were extracted."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12.5px] text-ink-faint">
            {resolution.lines.length} items · tap to check off
          </p>
          <ul className="mt-4 flex flex-col gap-1.5">
            {resolution.lines.map((line, index) => {
              const done = checked.has(index);
              return (
                /* Keyed by position, not text: recipes legitimately repeat a
                   line ("1 tsp sea salt" for the rub and again for the sauce
                   — 9 of 118 live items do), and the checked state is indexed
                   by position, so a text key would collide the twins onto one
                   fiber. The list is render-order-stable, never reordered. */
                <li key={`${index}:${line}`}>
                  <button
                    type="button"
                    aria-pressed={done}
                    onClick={() => toggle(index)}
                    className="flex w-full items-start gap-3 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-cream"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 h-[17px] w-[17px] flex-none rounded-[6px] border transition-colors ${
                        done
                          ? "border-apricot bg-apricot"
                          : "border-line bg-card"
                      }`}
                    />
                    <span
                      className={`text-[14px] leading-[1.5] ${
                        done ? "text-ink-faint line-through" : "text-ink"
                      }`}
                    >
                      {line}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
