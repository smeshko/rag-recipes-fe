import { useCallback, useRef, useState } from "react";
import type {
  KnowledgeItemResponse,
  KnowledgeItemUpdateRequest,
} from "../../../api";
import { ingredientLines } from "../ingredientLines";
import { flaggedIngredientPositions } from "../reviewMarks";
import { stepLines } from "../stepLines";

/** One editable line. `id` is synthetic and travels with the row through a
    reorder — it is never derived from the index or the text. */
export interface LineRow {
  id: string;
  text: string;
  /** Seeded true for an ingredient row the backend named on a
      `low_normalization_confidence` flag. Travels with the row through a
      reorder; a fresh row is never flagged. Presentation only — it never
      reaches the wire. */
  flagged?: boolean;
}

export type ListName = "ingredients" | "steps";

export type ScalarField =
  | "title"
  | "summary"
  | "yieldText"
  /* Never `yield`: it is a reserved word in a strict-mode function body. Only
     the patch key is "yield". */
  | "prepTime"
  | "cookTime"
  | "totalTime";

export interface EditForm {
  title: string;
  summary: string;
  yieldText: string;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  ingredients: LineRow[];
  steps: LineRow[];
}

/** The normalized shape both the seed snapshot and the live comparison take. */
interface Snapshot extends Record<ScalarField, string> {
  ingredients: string[];
  steps: string[];
}

/* The one normalizer. It is load-bearing twice over: it decides what counts as
   an edit (D8) and it is what goes on the wire (D9) — the backend answers 422
   to a blank or whitespace-only line, so trimming and dropping blanks cannot
   be a compare-only convenience. */
const norm = (value: string) => value.trim();

const normList = (rows: LineRow[]) =>
  rows.map((row) => norm(row.text)).filter(Boolean);

/* What actually goes on the wire, which is NOT `normList`. The backend matches
   submitted lines back to existing rows *by text* and guarantees that
   "untouched lines pass through byte-identical" (ARCHITECTURE.md "Edit semantics") — so a
   seeded row that the reviewer never touched must go out with its ORIGINAL
   bytes. `ingredientLines`' structured arm maps `raw_text` without trimming, so
   a padded line really can reach the form; normalizing it would fail the
   backend's match and demote an untouched row to human-authored, nulling its
   parse and its source spans. Only rows the reviewer actually changed (and rows
   they added) are normalized. Blank and whitespace-only rows still drop either
   way — those are a 422 (D9). */
const wireList = (rows: LineRow[], originals: Map<string, string>) =>
  rows
    .map((row) => {
      const original = originals.get(row.id);
      return original !== undefined && norm(original) === norm(row.text)
        ? original
        : norm(row.text);
    })
    .filter((text) => text.trim() !== "");

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/* Field → patch key for the five nullable scalars. `title` is absent on
   purpose: it is non-nullable on the item, so it can be rewritten but never
   cleared, and an emptied one is a validation failure rather than a `null`. */
const NULLABLE_SCALARS = [
  ["summary", "summary"],
  ["yieldText", "yield"],
  ["prepTime", "prep_time"],
  ["cookTime", "cook_time"],
  ["totalTime", "total_time"],
] as const;

function snapshotOf(form: EditForm): Snapshot {
  return {
    title: norm(form.title),
    summary: norm(form.summary),
    yieldText: norm(form.yieldText),
    prepTime: norm(form.prepTime),
    cookTime: norm(form.cookTime),
    totalTime: norm(form.totalTime),
    ingredients: normList(form.ingredients),
    steps: normList(form.steps),
  };
}

interface SeededState {
  /** The item id this state was seeded from — the seed-once guard's key. */
  id: string;
  form: EditForm;
  seed: Snapshot;
  /** Row id → the row's text exactly as it arrived, before any normalization.
      `wireList` reads it so an untouched row is resent byte-identical. */
  originals: Map<string, string>;
}

function seedState(
  item: KnowledgeItemResponse,
  mintId: (list: ListName) => string,
): SeededState {
  const ki = item.knowledge_item;
  const sd = ki.structured_data;

  /* Narrow on `kind` first: the `empty` arm carries no `lines` property at
     all. An item with no ingredients — the `no_ingredients` flag this epic
     exists to repair — seeds ONE BLANK ROW, because the reviewer needs
     somewhere to type (D5). Steps do the same, with no `steps_text` fallback
     (D7) — read mode ignores it too, and the two must agree. */
  const resolution = ingredientLines(sd);
  const ingredientTexts = resolution.kind === "empty" ? [""] : resolution.lines;
  const flagged = flaggedIngredientPositions(ki.review_reasons);
  const isFlagged = (index: number) =>
    resolution.kind === "structured" &&
    flagged.has(resolution.rows[index].position);
  const stepTexts = stepLines(sd).map((step) => step.text);

  const form: EditForm = {
    /* `knowledge_item.title`, not `display.title`: the patch targets the
       stored field, and `display` is a presentation projection. */
    title: ki.title,
    summary: ki.summary ?? "",
    yieldText: sd.yield ?? "",
    prepTime: sd.prep_time ?? "",
    cookTime: sd.cook_time ?? "",
    totalTime: sd.total_time ?? "",
    ingredients: ingredientTexts.map((text, index) => ({
      id: mintId("ingredients"),
      text,
      ...(isFlagged(index) ? { flagged: true } : {}),
    })),
    steps: (stepTexts.length > 0 ? stepTexts : [""]).map((text) => ({
      id: mintId("steps"),
      text,
    })),
  };

  const originals = new Map<string, string>();
  for (const row of [...form.ingredients, ...form.steps]) {
    originals.set(row.id, row.text);
  }

  /* The snapshot is the normalizer applied to the SEEDED ROWS, not to the
     payload (D8). Otherwise the blank row seeded above, and any payload line
     of " " (which survives `ingredientLines`' Boolean filter but not trim),
     would make an untouched form report dirty the moment it mounted. */
  return { id: ki.id, form, seed: snapshotOf(form), originals };
}

export interface UseEditForm {
  form: EditForm;
  setField: (key: ScalarField, value: string) => void;
  setRows: (list: ListName, rows: LineRow[]) => void;
  newRow: (list: ListName) => LineRow;
  isDirty: boolean;
  isValid: boolean;
  patchBody: () => KnowledgeItemUpdateRequest;
}

/**
 * The whole edit state for one flagged item: scalars and line rows seeded
 * **once**, `isDirty` / `isValid` derived against that seed, and a patch body
 * carrying only what the reviewer actually changed.
 *
 * Called only from `RecipeEditForm` (D22) — the page's four early returns sit
 * above the success rung, so calling it there would be a conditional hook.
 */
export function useEditForm(item: KnowledgeItemResponse): UseEditForm {
  /* One counter across both lists, so an id is unique everywhere by
     construction. Deterministic (unlike crypto.randomUUID) so tests can read
     the ids, and monotonic so an added row can never collide with a seeded
     one. */
  const counter = useRef(0);
  const mintId = useCallback((list: ListName) => {
    const n = counter.current;
    counter.current += 1;
    return `${list === "ingredients" ? "ing" : "step"}-${n}`;
  }, []);

  const [state, setState] = useState<SeededState>(() =>
    seedState(item, mintId),
  );

  /* Seed once, keyed on the item id. A background refetch of
     ["knowledge-item", id] hands this hook a brand new object with the same
     id — reseeding on it would silently discard everything typed. A DIFFERENT
     id is a different recipe and must reseed. This is React's documented
     adjust-state-during-render pattern, not an effect: an effect would render
     one frame of the previous item's text into the new item's form. */
  let current = state;
  if (state.id !== item.knowledge_item.id) {
    current = seedState(item, mintId);
    setState(current);
  }

  const setField = useCallback((key: ScalarField, value: string) => {
    setState((prev) => ({ ...prev, form: { ...prev.form, [key]: value } }));
  }, []);

  const setRows = useCallback((list: ListName, rows: LineRow[]) => {
    setState((prev) => ({ ...prev, form: { ...prev.form, [list]: rows } }));
  }, []);

  /* Mints, but does not insert: the caller decides where the row goes, which
     is what keeps add, paste-split and undo out of this hook. */
  const newRow = useCallback(
    (list: ListName): LineRow => ({ id: mintId(list), text: "" }),
    [mintId],
  );

  const { form, seed, originals } = current;
  const live = snapshotOf(form);
  const ingredientsDirty = !sameList(live.ingredients, seed.ingredients);
  const stepsDirty = !sameList(live.steps, seed.steps);
  const scalarsDirty =
    live.title !== seed.title ||
    NULLABLE_SCALARS.some(([field]) => live[field] !== seed[field]);

  /* Derived, never stored: 5.4 calls it at submit time, and calling it twice
     must yield deep-equal bodies and change nothing. */
  const patchBody = (): KnowledgeItemUpdateRequest => {
    const body: KnowledgeItemUpdateRequest = {};
    if (live.title !== seed.title) {
      body.title = live.title;
    }
    for (const [field, key] of NULLABLE_SCALARS) {
      if (live[field] !== seed[field]) {
        /* An absent key means unchanged, so `null` is the only way to clear. */
        body[key] = live[field] === "" ? null : live[field];
      }
    }
    /* Whole-array replacement, always complete when dirty — INCLUDING `[]`,
       which is how a section is emptied. Omitting the key because the list is
       empty would read as "unchanged" and silently discard the deletion, and
       an explicit `null` is a 422. */
    if (ingredientsDirty) {
      body.ingredients = wireList(form.ingredients, originals);
    }
    if (stepsDirty) {
      body.steps = wireList(form.steps, originals);
    }
    return body;
  };

  return {
    form,
    setField,
    setRows,
    newRow,
    isDirty: scalarsDirty || ingredientsDirty || stepsDirty,
    /* The one client-side rule (D10): a title cannot be cleared. */
    isValid: live.title !== "",
    patchBody,
  };
}
