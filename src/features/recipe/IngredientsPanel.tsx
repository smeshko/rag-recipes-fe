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
  /* Row identity is resolved here rather than in the JSX. Recipes legitimately
     repeat a line verbatim — 9 of 118 items on the live shelf do, a second
     "1 tsp sea salt" for the sauce — so keying on the text alone collides the
     twins onto one React fiber. The list is built once per payload and never
     reordered, and the checked state is addressed by the same index. */
  const rows =
    resolution.kind === "empty"
      ? []
      : resolution.lines.map((line, index) => ({
          key: `${index}:${line}`,
          index,
          line,
        }));
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
        <p className="mt-3 text-[13.5px] text-fg-subtle italic">
          {status === "extracting"
            ? "Still being extracted…"
            : "No ingredients were extracted."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12.5px] text-fg-subtle">
            {rows.length} items · tap to check off
          </p>
          <ul className="mt-4 flex flex-col gap-1.5">
            {rows.map(({ key, index, line }) => {
              const done = checked.has(index);
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-pressed={done}
                    onClick={() => toggle(index)}
                    className="flex w-full items-start gap-3 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-surface-inset pointer-coarse:min-h-11"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 h-[17px] w-[17px] flex-none rounded-[6px] border transition-colors ${
                        done
                          ? "border-accent bg-accent"
                          : "border-border bg-surface-raised"
                      }`}
                    />
                    <span
                      className={`text-[14px] leading-[1.5] ${
                        done ? "text-fg-subtle line-through" : "text-fg"
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
