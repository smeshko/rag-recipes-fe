import { useCallback, useRef, useState } from "react";
import type { KnowledgeItemCreateRequest } from "../../../api";
import type {
  EditForm,
  LineRow,
  ListName,
  ScalarField,
} from "../edit/useEditForm";

/* The field SHAPE is imported from `edit/`, and only the shape: this hook
   shares no logic with `useEditForm` because there is none to share. Almost
   everything that file does is diffing a draft against the item it was seeded
   from — the seed-once guard, the dirty-vs-seed comparison, the byte-identity
   wire list that lets an untouched line survive the backend's text match, the
   absent-vs-null patch keys. None of that has a meaning here: nothing was
   seeded, every line is new, and the create endpoint takes the whole recipe
   rather than a diff of one.

   What must stay identical is the shape the field components bind to, so
   `TitleFields`, `FactsFields` and the two line panels are the same components
   on both surfaces rather than near-copies. Importing the types is what
   guarantees that — add a field to `EditForm` and this file stops compiling
   until it seeds one. */

/** Trim, like the edit form's own normalizer, and for the same two reasons: it
    decides what counts as typed, and it is what goes on the wire — the backend
    answers 422 to a blank or whitespace-only line. */
const norm = (value: string) => value.trim();

const normList = (rows: LineRow[]) =>
  rows.map((row) => norm(row.text)).filter(Boolean);

/** Field → create-body key for the five optional scalars. `title` is absent
    for the opposite reason it is absent from the edit form's list: there it
    cannot be cleared, here it is the one required key. */
const OPTIONAL_SCALARS = [
  ["summary", "summary"],
  ["yieldText", "yield"],
  ["prepTime", "prep_time"],
  ["cookTime", "cook_time"],
  ["totalTime", "total_time"],
] as const satisfies readonly (readonly [
  ScalarField,
  keyof KnowledgeItemCreateRequest,
])[];

/** One blank row per list, because the author needs somewhere to type — the
    same choice `seedState` makes for an item flagged `no_ingredients`. */
function blankForm(mintId: (list: ListName) => string): EditForm {
  return {
    title: "",
    summary: "",
    yieldText: "",
    prepTime: "",
    cookTime: "",
    totalTime: "",
    ingredients: [{ id: mintId("ingredients"), text: "" }],
    steps: [{ id: mintId("steps"), text: "" }],
  };
}

export interface UseNewRecipeForm {
  form: EditForm;
  setField: (key: ScalarField, value: string) => void;
  setRows: (list: ListName, rows: LineRow[]) => void;
  newRow: (list: ListName) => LineRow;
  /** Anything typed at all — what the unsaved guard prompts on. */
  isDirty: boolean;
  /** The one client-side rule, and the same one the edit form has: a recipe
      needs a title. */
  isValid: boolean;
  createBody: () => KnowledgeItemCreateRequest;
}

/**
 * The whole draft state for a recipe being written from nothing.
 *
 * Deliberately smaller than `useEditForm`: no seed to compare against, so
 * `isDirty` is simply "is anything non-blank", and `createBody` sends the
 * whole recipe every time rather than a diff. An empty optional is **omitted**
 * rather than sent as `null` — on a row that does not exist yet the two mean
 * the same thing to the backend, and omitting keeps the request to what the
 * author actually wrote.
 */
export function useNewRecipeForm(): UseNewRecipeForm {
  /* One counter across both lists so an id is unique everywhere by
     construction; deterministic (unlike crypto.randomUUID) so tests can read
     the ids. Same rule as the edit form's, because `LineListEditor`'s focus
     bookkeeping is keyed on these ids and a collision would move focus to the
     wrong row. */
  const counter = useRef(0);
  const mintId = useCallback((list: ListName) => {
    const n = counter.current;
    counter.current += 1;
    return `${list === "ingredients" ? "ing" : "step"}-${n}`;
  }, []);

  const [form, setForm] = useState<EditForm>(() => blankForm(mintId));

  const setField = useCallback((key: ScalarField, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setRows = useCallback((list: ListName, rows: LineRow[]) => {
    setForm((prev) => ({ ...prev, [list]: rows }));
  }, []);

  /* Mints, but does not insert — the caller decides where the row goes, which
     is what keeps add, paste-split and undo out of this hook. */
  const newRow = useCallback(
    (list: ListName): LineRow => ({ id: mintId(list), text: "" }),
    [mintId],
  );

  const title = norm(form.title);
  const ingredients = normList(form.ingredients);
  const steps = normList(form.steps);

  /* Derived, never stored: calling it twice must yield deep-equal bodies and
     change nothing. */
  const createBody = (): KnowledgeItemCreateRequest => {
    const body: KnowledgeItemCreateRequest = {
      title,
      /* Always present, even when empty. `[]` is a real answer here — the
         backend accepts a recipe that is only a title — and there is no
         "unchanged" for an omission to mean. */
      ingredients,
      steps,
    };
    for (const [field, key] of OPTIONAL_SCALARS) {
      const value = norm(form[field]);
      if (value !== "") {
        body[key] = value;
      }
    }
    return body;
  };

  return {
    form,
    setField,
    setRows,
    newRow,
    isDirty:
      title !== "" ||
      ingredients.length > 0 ||
      steps.length > 0 ||
      OPTIONAL_SCALARS.some(([field]) => norm(form[field]) !== ""),
    isValid: title !== "",
    createBody,
  };
}
