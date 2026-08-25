import { useState } from "react";
import type {
  RecipeStructuredData,
  ReviewFlag,
  ReviewThresholds,
} from "../../api";
import { Panel } from "../../ui";
import { ingredientLines } from "./ingredientLines";
import { LowScoreMark } from "./LowScoreMark";
import {
  flaggedIngredientPositions,
  type LowMark,
  lowMark,
} from "./reviewMarks";

export function IngredientsPanel({
  sd,
  status,
  flags = [],
  thresholds = null,
}: {
  sd: RecipeStructuredData;
  status: string;
  /** The item's review reasons; only `low_normalization_confidence` ones with
      `ingredient_positions` produce marks. */
  flags?: ReviewFlag[];
  thresholds?: ReviewThresholds | null;
}) {
  const resolution = ingredientLines(sd);
  /* Which rows to mark, and with what score. The BACKEND names the rows
     (`ingredient_positions`); the score shown is the row's own
     `confidence.normalization`, judged against the bound it shipped. A named
     row whose score is missing still gets marked — the flag is the authority —
     just without a number. */
  const flagged = flaggedIngredientPositions(flags);
  /* Row identity is resolved here rather than in the JSX. Recipes legitimately
     repeat a line verbatim — 9 of 118 items on the live shelf do, a second
     "1 tsp sea salt" for the sauce — so keying on the text alone collides the
     twins onto one React fiber. The list is built once per payload and never
     reordered, and the checked state is addressed by the same index. */
  const rows =
    resolution.kind === "empty"
      ? []
      : resolution.lines.map((line, index) => {
          const row =
            resolution.kind === "structured" ? resolution.rows[index] : null;
          const isFlagged = row !== null && flagged.has(row.position);
          const mark: LowMark | null = isFlagged
            ? lowMark(
                row.ingredient.confidence?.normalization,
                thresholds?.normalization,
              )
            : null;
          return { key: `${index}:${line}`, index, line, isFlagged, mark };
        });
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
      <h2 className="text-[18px] font-semibold tracking-[-0.01em]">
        Ingredients
      </h2>
      {resolution.kind === "empty" ? (
        /* Plain, not italic: an empty panel is stating a fact about the
           payload, and italics made it read as an apology. */
        <p className="mt-3 text-[13px] text-fg-subtle">
          {status === "extracting"
            ? "Still being extracted…"
            : "No ingredients were extracted."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-fg-subtle">
            {rows.length} items · tap to check off
          </p>
          <ul className="mt-4 flex flex-col gap-1.5">
            {rows.map(({ key, index, line, isFlagged, mark }) => {
              const done = checked.has(index);
              return (
                <li
                  key={key}
                  data-testid={isFlagged ? "ingredient-flagged" : undefined}
                  /* The warning fill and a left rule, so a flagged row reads as
                     flagged even before the eye lands on the score pill. */
                  className={
                    isFlagged
                      ? "rounded-[10px] border-l-[3px] border-warning-border bg-warning-fill"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    aria-pressed={done}
                    onClick={() => toggle(index)}
                    /* --color-surface-hover, not -inset: inset is the resting
                       fill of chips and code, so using it as a hover made a
                       hovered row look like a filled control that had somehow
                       stayed pressed. */
                    className="flex w-full items-start gap-3 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-surface-hover pointer-coarse:min-h-11"
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
                      className={`text-[15px] leading-[1.5] ${
                        done ? "text-fg-subtle line-through" : "text-fg"
                      }`}
                    >
                      {line}
                      {mark ? (
                        <LowScoreMark
                          mark={mark}
                          label="Normalization"
                          testId="ingredient-score"
                        />
                      ) : null}
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
