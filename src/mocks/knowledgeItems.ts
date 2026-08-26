import { HttpResponse, http } from "msw";
import type {
  ErrorEnvelope,
  Ingredient,
  KnowledgeItemCreateRequest,
  KnowledgeItemResponse,
  KnowledgeItemUpdateRequest,
  RecipeStructuredData,
  ReviewFlag,
  ReviewThresholds,
  Step,
} from "../api";

/* In-place EDIT mocks for PATCH /api/v1/knowledge-items/{item_id} (phase
   5.2). Src-side placement matches src/mocks/review.ts and is deliberate
   (PLAN D10): tsconfig.app.json includes only `src`, so this module cannot
   import the read fixtures from tests/msw/knowledgeItems.ts and carries a
   small editable roster of its own. Those read fixtures are neither moved
   nor touched. msw never reaches the production bundle — the only importers
   are the node test server and the test files.

   Every payload below mirrors the backend's edit contract (ARCHITECTURE.md
   "API contracts" → Edit semantics)
   field-for-field, and every type comes from `../api`, so contract drift
   breaks compilation rather than passing quietly. Fixture hygiene: synthetic
   ids only (`item_*` / `doc_*` / `span_*`), never a dev-DB UUID.

   MOCK DIVERGENCES FROM THE SERVER — the contract doc's §2 table, quoted so
   phase 5.3 builds on neither a clearing the server will not deliver nor a
   permanence it will not honour:

   | Code                         | Server   | this module                    |
   |------------------------------|----------|--------------------------------|
   | no_ingredients               | clears   | clears                         |
   | no_steps                     | clears   | clears                         |
   | recipe_too_short             | clears   | clears                         |
   | recipe_too_long              | clears   | KEEPS — the mock models no     |
   |                              |          | upper bound, and no fixture    |
   |                              |          | carries the code               |
   | low_normalization_confidence | clears   | KEEPS — needs per-line         |
   |                              | once     | threshold bookkeeping the      |
   |                              | every    | fixtures do not carry          |
   |                              | below-   |                                |
   |                              | threshold|                                |
   |                              | line is  |                                |
   |                              | edited   |                                |
   | low_overall_confidence       | keeps    | keeps                          |
   | low_boundary_confidence      | keeps    | keeps                          |

   Recomputation is SYMMETRIC over the three codes the mock models: an edit
   that empties a list or drops the body under MOCK_MIN_RECIPE_CHARS RAISES
   the code again, exactly as the server's `validate_soft` re-derivation
   would. The four preserve-only codes are never raised — the mock has no
   basis to invent a confidence verdict or an upper length bound.

   Two of them are still DROPPED when the corrected content makes them
   impossible rather than merely unfixed (`coherent` below): recipe_too_long
   alongside a body that is now too short, and low_normalization_confidence
   with no ingredient lines left to be below the threshold. The mock must not
   answer with a state the server could not produce. */

/** The copy table, transcribed verbatim from the backend's
    `api/review_reasons.py` SOFT_WARNING_MESSAGES. These seven codes are the
    only ones `validate_soft` raises; anything else is enveloped as
    `llm_warning` exactly as `build_review_reasons` does it. */
export const SOFT_WARNING_MESSAGES: Record<string, string> = {
  no_ingredients: "No ingredients were extracted.",
  no_steps: "No preparation steps were extracted.",
  low_overall_confidence:
    "Overall extraction confidence was below the threshold.",
  low_boundary_confidence:
    "Recipe boundary confidence was below the threshold.",
  recipe_too_short: "The recipe body is shorter than expected.",
  recipe_too_long: "The recipe body is longer than expected.",
  low_normalization_confidence:
    "An ingredient normalization confidence was below the threshold.",
};

/**
 * The `recipe_too_short` bound, in characters of composed body text.
 *
 * A MOCK INVENTION. The real threshold is a backend `Settings` value
 * (`min_recipe_chars`) the FE never sees and must never hardcode into
 * product code — it lives here only so a fixture can sit under it and a
 * patch can be seen to cross it.
 */
export const MOCK_MIN_RECIPE_CHARS = 120;

/* The wire carries `edited: true` on human-authored lines (contract §1); the
   hand-written FE `Ingredient`/`Step` types predate it and phase 5.4's
   `just typegen` is what declares it properly. Modelled locally so the mock
   can emit the field without inventing one in src/api/types.ts. */
type EditedIngredient = Ingredient & { edited?: boolean };
type EditedStep = Step & { edited?: boolean };

/* ---------- fixtures ---------- */

const ingredientRow = (
  position: number,
  rawText: string,
  parse: {
    quantity_text?: string | null;
    quantity_value?: number | null;
    unit_raw?: string | null;
    unit_normalized?: string | null;
    item_text?: string | null;
    preparation?: string | null;
    notes?: string | null;
    normalization?: number;
  } = {},
): Ingredient => ({
  position,
  raw_text: rawText,
  quantity_text: parse.quantity_text ?? null,
  quantity_value: parse.quantity_value ?? null,
  unit_raw: parse.unit_raw ?? null,
  unit_normalized: parse.unit_normalized ?? null,
  item_text: parse.item_text ?? null,
  item_normalized: parse.item_text ?? null,
  preparation: parse.preparation ?? null,
  notes: parse.notes ?? null,
  confidence: {
    overall: 0.88,
    quantity: 0.95,
    unit: 0.95,
    item: 0.9,
    normalization: parse.normalization ?? 0.93,
  },
});

const stepRow = (stepNumber: number, text: string, spanId: string): Step => ({
  step_number: stepNumber,
  text,
  source_span_ids: [spanId],
  confidence: { overall: 0.92, ordering: 0.94 },
});

const linesText = (
  rows: { raw_text?: string | null; text?: string | null }[],
) => rows.map((row) => row.raw_text ?? row.text ?? "").join("\n");

/**
 * The soft-validation bounds the mock judges against — the FE twin of the
 * backend's `review_thresholds`. A MOCK INVENTION, like `MOCK_MIN_RECIPE_CHARS`:
 * the real values are `Settings` the backend ships per item, and product code
 * only ever reads them off the wire.
 */
export const MOCK_REVIEW_THRESHOLDS: ReviewThresholds = {
  overall: 0.5,
  boundary: 0.5,
  normalization: 0.5,
};

/** What the backend's `build_review_reasons` needs beyond the codes to attach
    its reviewer aids: the item's top-level scores and its ingredient rows. */
interface ReasonAids {
  confidence?: { overall?: number | null; boundary?: number | null } | null;
  ingredients?: readonly Ingredient[] | null;
}

/** Projection of warning codes into `{code, message}` — the FE mirror of the
    backend's `build_review_reasons`: populated only for `needs_review`, and
    a non-canonical string is enveloped rather than promoted into `code`.

    With `aids`, the three confidence codes also carry `value` / `threshold`
    and `low_normalization_confidence` names the `ingredient_positions` under
    the bound (the lowest row when none is, as the backend does). */
export const buildReviewReasons = (
  status: string,
  warnings: readonly string[] | null | undefined,
  aids?: ReasonAids,
): ReviewFlag[] => {
  if (status !== "needs_review" || !Array.isArray(warnings)) {
    return [];
  }
  return warnings.map((warning) => {
    if (!(warning in SOFT_WARNING_MESSAGES)) {
      return { code: "llm_warning", message: String(warning) };
    }
    const flag: ReviewFlag = {
      code: warning,
      message: SOFT_WARNING_MESSAGES[warning],
    };
    if (!aids) {
      return flag;
    }
    if (warning === "low_overall_confidence") {
      flag.value = aids.confidence?.overall ?? null;
      flag.threshold = MOCK_REVIEW_THRESHOLDS.overall;
    } else if (warning === "low_boundary_confidence") {
      flag.value = aids.confidence?.boundary ?? null;
      flag.threshold = MOCK_REVIEW_THRESHOLDS.boundary;
    } else if (warning === "low_normalization_confidence") {
      const threshold = MOCK_REVIEW_THRESHOLDS.normalization;
      const scored = (aids.ingredients ?? []).flatMap((ing, index) => {
        const score = ing.confidence?.normalization;
        return typeof score === "number"
          ? [{ position: ing.position ?? index, score }]
          : [];
      });
      flag.threshold = threshold;
      if (scored.length > 0) {
        const lowest = Math.min(...scored.map((row) => row.score));
        const below = scored.filter((row) => row.score < threshold);
        flag.value = lowest;
        flag.ingredient_positions = (
          below.length > 0
            ? below
            : scored.filter((row) => row.score === lowest)
        ).map((row) => row.position);
      } else {
        flag.value = null;
        flag.ingredient_positions = null;
      }
    }
    return flag;
  });
};

const editableItem = (options: {
  id: string;
  documentId: string;
  spanId: string;
  title: string;
  summary: string | null;
  subtitle: string;
  pages: [number, number];
  status?: string;
  confidence: { overall: number; boundary: number };
  structured: Omit<Required<RecipeStructuredData>, "warnings" | "schema">;
  warnings: string[];
}): KnowledgeItemResponse => {
  const status = options.status ?? "needs_review";
  const warnings = options.warnings;
  return {
    knowledge_item: {
      id: options.id,
      document_id: options.documentId,
      item_type: "recipe",
      title: options.title,
      summary: options.summary,
      status,
      source_span_ids: [options.spanId],
      confidence: {
        overall: options.confidence.overall,
        boundary: options.confidence.boundary,
        fields: {
          title: 0.94,
          summary: 0.8,
          ingredients: 0.55,
          steps: 0.61,
          yield: 0.9,
        },
      },
      structured_data: { schema: "recipe.v1", ...options.structured, warnings },
      review_reasons: buildReviewReasons(status, warnings, {
        confidence: options.confidence,
        ingredients: options.structured.ingredients,
      }),
      review_thresholds:
        status === "needs_review" ? MOCK_REVIEW_THRESHOLDS : null,
      /* Nobody has edited these yet — the whole point of the fixtures. */
      edited_at: null,
    },
    display: { title: options.title, subtitle: options.subtitle },
    source_citations: [
      {
        source_span_id: options.spanId,
        label: options.subtitle.split(" · ")[1] ?? "page 1",
        locator: {
          type: "pdf_page_range",
          page_start: options.pages[0],
          page_end: options.pages[1],
          meta: {
            confidence: null,
            suspicious: false,
            extraction_method: "embedded_text",
            extractor_identity: "pymupdf:embedded_text",
          },
        },
      },
    ],
  };
};

const noIngredientsSteps = [
  stepRow(1, "Whisk the maple syrup into the softened butter.", "span_maple"),
  stepRow(2, "Chill the dough for an hour before rolling.", "span_maple"),
  stepRow(3, "Bake at 350°F until the edges colour.", "span_maple"),
];

const shortIngredients = [
  ingredientRow(1, "1 cup stone-ground cornmeal", {
    quantity_text: "1",
    quantity_value: 1,
    unit_raw: "cup",
    unit_normalized: "cup",
    item_text: "stone-ground cornmeal",
  }),
  ingredientRow(2, "1 cup buttermilk", {
    quantity_text: "1",
    quantity_value: 1,
    unit_raw: "cup",
    unit_normalized: "cup",
    item_text: "buttermilk",
  }),
];

const shortSteps = [stepRow(1, "Bake until golden.", "span_cornbread")];

/* Two verbatim-identical salt lines, distinguishable only by `notes` — the
   duplicate case 5.3's row identity must survive, and the case that proves
   by-text matching consumes its pool greedily left-to-right. */
const confidenceIngredients = [
  ingredientRow(1, "2 cups bread flour", {
    quantity_text: "2",
    quantity_value: 2,
    unit_raw: "cups",
    unit_normalized: "cup",
    item_text: "bread flour",
    normalization: 0.52,
  }),
  ingredientRow(2, "1 tsp fine sea salt", {
    quantity_text: "1",
    quantity_value: 1,
    unit_raw: "tsp",
    unit_normalized: "teaspoon",
    item_text: "sea salt",
    notes: "for the dough",
  }),
  ingredientRow(3, "3 tbsp honey", {
    quantity_text: "3",
    quantity_value: 3,
    unit_raw: "tbsp",
    unit_normalized: "tablespoon",
    item_text: "honey",
  }),
  ingredientRow(4, "1 tsp fine sea salt", {
    quantity_text: "1",
    quantity_value: 1,
    unit_raw: "tsp",
    unit_normalized: "teaspoon",
    item_text: "sea salt",
    notes: "for the topping",
  }),
];

const confidenceSteps = [
  stepRow(
    1,
    "Stir the honey into the warm milk and proof the yeast.",
    "span_loaf",
  ),
  stepRow(2, "Knead for ten minutes, then rise until doubled.", "span_loaf"),
  stepRow(
    3,
    "Bake at 375°F for forty minutes and cool on a rack.",
    "span_loaf",
  ),
];

/**
 * Three `needs_review` recipes, each proving one branch of the flag rules.
 * Every one carries `edited_at: null` and `review_reasons` consistent with
 * its `warnings`; `item_edit_confidence` holds the verbatim-duplicate line.
 */
export const editableItemsFixture: KnowledgeItemResponse[] = [
  /* The epic's motivating case: one code an edit clears (`no_ingredients`),
     one it must not (`low_overall_confidence`). */
  editableItem({
    id: "item_edit_noingredients",
    documentId: "doc_baking",
    spanId: "span_maple",
    title: "Maple Cutout Cookies",
    summary: "Crisp maple-sweetened cutout cookies for decorating.",
    subtitle: "bakingwithlesssugar · pages 41–43",
    pages: [41, 43],
    confidence: { overall: 0.42, boundary: 0.71 },
    structured: {
      yield: "24 cookies",
      prep_time: "20 minutes",
      cook_time: "12 minutes",
      total_time: "32 minutes",
      ingredients: [],
      ingredients_text: null,
      steps: noIngredientsSteps,
      steps_text: linesText(noIngredientsSteps),
    },
    warnings: ["no_ingredients", "low_overall_confidence"],
  }),
  /* Two ingredients and one step: a composed body under
     MOCK_MIN_RECIPE_CHARS, so a patch can be seen to cross the threshold. */
  editableItem({
    id: "item_edit_short",
    documentId: "doc_baking",
    spanId: "span_cornbread",
    title: "Skillet Cornbread",
    summary: "A plain buttermilk cornbread baked in a hot skillet.",
    subtitle: "bakingwithlesssugar · page 57",
    pages: [57, 57],
    confidence: { overall: 0.74, boundary: 0.8 },
    structured: {
      yield: "1 skillet",
      prep_time: "10 minutes",
      cook_time: "25 minutes",
      total_time: "35 minutes",
      ingredients: shortIngredients,
      ingredients_text: linesText(shortIngredients),
      steps: shortSteps,
      steps_text: linesText(shortSteps),
    },
    warnings: ["recipe_too_short"],
  }),
  /* Complete content and nothing an edit can clear — the survive path. */
  editableItem({
    id: "item_edit_confidence",
    documentId: "doc_baking",
    spanId: "span_loaf",
    title: "Honey Oat Sandwich Loaf",
    summary: "A soft sandwich loaf sweetened with honey instead of sugar.",
    subtitle: "bakingwithlesssugar · page 88",
    pages: [88, 88],
    confidence: { overall: 0.66, boundary: 0.39 },
    structured: {
      yield: "1 loaf",
      prep_time: "25 minutes",
      cook_time: "40 minutes",
      total_time: "3 hours",
      ingredients: confidenceIngredients,
      ingredients_text: linesText(confidenceIngredients),
      steps: confidenceSteps,
      steps_text: linesText(confidenceSteps),
    },
    warnings: ["low_boundary_confidence", "low_normalization_confidence"],
  }),
];

/** A decided item — editing is restricted to `needs_review`, so patching
    this one is the `review_not_pending` row of the error table. Never a
    member of `editableItemsFixture`; register it per test. */
export const decidedItemFixture: KnowledgeItemResponse = editableItem({
  id: "item_edit_decided",
  documentId: "doc_baking",
  spanId: "span_galette",
  title: "Rustic Pear Galette",
  summary: null,
  subtitle: "bakingwithlesssugar · page 112",
  pages: [112, 112],
  status: "ready",
  confidence: { overall: 0.91, boundary: 0.93 },
  structured: {
    yield: "8 slices",
    prep_time: "30 minutes",
    cook_time: "45 minutes",
    total_time: "1 hour 15 minutes",
    ingredients: shortIngredients,
    ingredients_text: linesText(shortIngredients),
    steps: shortSteps,
    steps_text: linesText(shortSteps),
  },
  warnings: [],
});

/* ---------- flag recomputation ---------- */

/** The composed body the length rules measure. The backend composes
    title + ingredients_text + steps_text and rebuilds it ONLY when the line
    lists change; composing from the two text blocks alone reaches the same
    place — a title-only or timings-only edit cannot move the verdict. */
const composedBody = (structuredData: RecipeStructuredData): string =>
  [structuredData.ingredients_text, structuredData.steps_text]
    .filter((block): block is string => Boolean(block))
    .join("\n\n");

/** The three codes the mock DERIVES from the patched content rather than
    carrying forward — the clearable rows of the contract's §2 table it can
    actually decide. The other four are preserve-only (see below). */
const MODELLED_CONTENT_CODES = [
  "no_ingredients",
  "no_steps",
  "recipe_too_short",
] as const;

/** Does the corrected content still warrant this code? One row of the
    contract's §2 table per branch, deliberately spelled out rather than
    collapsed into a set — the divergences have to be visible next to the
    code that causes them.

    Symmetric by design: a `false` here CLEARS a code the item carried, a
    `true` RAISES one the edit created — emptying a list is a legal patch
    (§1: "send `[]` to empty it"), and the server would answer it with the
    warning back on. */
const warrantedByContent = (
  code: (typeof MODELLED_CONTENT_CODES)[number],
  structuredData: RecipeStructuredData,
): boolean => {
  switch (code) {
    case "no_ingredients":
      return (structuredData.ingredients ?? []).length === 0;
    case "no_steps":
      return (structuredData.steps ?? []).length === 0;
    case "recipe_too_short":
      return composedBody(structuredData).length < MOCK_MIN_RECIPE_CHARS;
  }
};

/** Re-derive the warning list from the corrected content, order preserved:
    the three modelled content codes are recomputed (dropped when the edit
    resolves them, raised when the edit creates them), every other code is
    carried forward untouched.
 *
 *  The four preserve-only codes:
 *  - low_overall_confidence / low_boundary_confidence — the server keeps them
 *    too. Judgments about whether the recipe was cut out of the page
 *    correctly; they clear on approve, not on fix. No divergence.
 *  - low_normalization_confidence — DIVERGENCE. The server clears it once
 *    every below-threshold line has been edited; the fixtures carry no
 *    per-line threshold bookkeeping to decide that with.
 *  - recipe_too_long — DIVERGENCE. The server clears it when the rebuilt body
 *    drops back under the upper bound; the mock models no upper bound, so it
 *    neither clears nor raises it. */
export const recomputeWarnings = (
  warnings: readonly string[],
  structuredData: RecipeStructuredData,
): string[] => {
  const isModelled = (
    code: string,
  ): code is (typeof MODELLED_CONTENT_CODES)[number] =>
    (MODELLED_CONTENT_CODES as readonly string[]).includes(code);
  const kept = warnings.filter(
    (code) => !isModelled(code) || warrantedByContent(code, structuredData),
  );
  const raised = MODELLED_CONTENT_CODES.filter(
    (code) =>
      !warnings.includes(code) && warrantedByContent(code, structuredData),
  );
  return coherent([...kept, ...raised], structuredData);
};

/** Drop preserve-only codes the corrected content makes IMPOSSIBLE, as
    opposed to merely unfixed. The mock derives one half of two coupled
    families, so the coherence rule is applied after recomputation rather
    than folded into it — a state the server could never answer with must
    not reach phase 5.3's UI just because the mock only models one side:

    - a body cannot be under the lower bound and over the upper one at once,
      and the lower bound is the one the mock actually measures;
    - `validate_soft` takes the MINIMUM normalization confidence across the
      ingredient list, so with no ingredients left there is no line below the
      threshold. This is narrower than D7's divergence, which is about a
      list that still HAS lines whose confidence the fixtures cannot track. */
const coherent = (
  codes: string[],
  structuredData: RecipeStructuredData,
): string[] => {
  const tooShort = codes.includes("recipe_too_short");
  const noIngredients = (structuredData.ingredients ?? []).length === 0;
  return codes.filter((code) => {
    if (code === "recipe_too_long") {
      return !tooShort;
    }
    if (code === "low_normalization_confidence") {
      return !noIngredients;
    }
    return true;
  });
};

/* ---------- the pure patch core ---------- */

const copyIngredient = (row: EditedIngredient): EditedIngredient => ({
  ...row,
  confidence: row.confidence ? { ...row.confidence } : row.confidence,
});

const copyStep = (row: EditedStep): EditedStep => ({
  ...row,
  confidence: row.confidence ? { ...row.confidence } : row.confidence,
  source_span_ids: row.source_span_ids
    ? [...row.source_span_ids]
    : row.source_span_ids,
});

/** Index existing rows by their text so unchanged lines can be matched back.
    Duplicates share one queue, consumed left to right, so N identical lines
    in map to N identical lines out instead of all binding the first row. */
const poolsByText = <T>(
  rows: T[],
  textOf: (row: T) => string | null | undefined,
): Map<string, T[]> => {
  const pools = new Map<string, T[]>();
  for (const row of rows) {
    const text = textOf(row);
    if (typeof text !== "string") {
      continue;
    }
    const pool = pools.get(text);
    if (pool) {
      pool.push(row);
    } else {
      pools.set(text, [row]);
    }
  }
  return pools;
};

const HUMAN_INGREDIENT_CONFIDENCE = {
  overall: 1,
  quantity: 1,
  unit: 1,
  item: 1,
  normalization: 1,
};

const HUMAN_STEP_CONFIDENCE = { overall: 1, ordering: 1 };

/** A matched line passes through untouched apart from its `position`; a new
    or changed line becomes a human-authored row — parse nulled, confidences
    1.0, `edited: true`. */
const editIngredients = (
  existing: EditedIngredient[],
  lines: string[],
): EditedIngredient[] => {
  const pools = poolsByText(existing, (row) => row.raw_text);
  return lines.map((line, index) => {
    const matched = pools.get(line)?.shift();
    if (matched) {
      return { ...copyIngredient(matched), position: index + 1 };
    }
    return {
      position: index + 1,
      raw_text: line,
      quantity_text: null,
      quantity_value: null,
      unit_raw: null,
      unit_normalized: null,
      item_text: null,
      item_normalized: null,
      preparation: null,
      notes: null,
      confidence: { ...HUMAN_INGREDIENT_CONFIDENCE },
      edited: true,
    };
  });
};

/** Same rule for steps, plus: an added or rewritten step carries an EMPTY
    `source_span_ids` — a human wrote it, and claiming a page cited it would
    be a lie. */
const editSteps = (existing: EditedStep[], lines: string[]): EditedStep[] => {
  const pools = poolsByText(existing, (row) => row.text);
  return lines.map((line, index) => {
    const matched = pools.get(line)?.shift();
    if (matched) {
      return { ...copyStep(matched), step_number: index + 1 };
    }
    return {
      step_number: index + 1,
      text: line,
      source_span_ids: [],
      confidence: { ...HUMAN_STEP_CONFIDENCE },
      edited: true,
    };
  });
};

/**
 * Apply a partial patch and re-derive everything that depends on it. PURE:
 * the argument is never mutated — the stateless handler serves one shared
 * fixture array to every test, and an in-place write would reintroduce
 * exactly the cross-test leak `reviewScenario`'s header warns about.
 *
 * Semantics, per ARCHITECTURE.md "Edit semantics": an ABSENT key is untouched,
 * an explicit `null` clears, and the two lists are whole-array replacement
 * of bare strings (22.1 `RecipeEdit.ingredients: list[str]`) matched back to
 * existing rows BY TEXT, not by position — which is what makes a pure
 * reorder keep each row's parse and provenance and only renumber it.
 */
export const applyPatch = (
  item: KnowledgeItemResponse,
  body: KnowledgeItemUpdateRequest,
): KnowledgeItemResponse => {
  const knowledgeItem = item.knowledge_item;
  const before = knowledgeItem.structured_data;

  const patchesIngredients = Array.isArray(body.ingredients);
  const patchesSteps = Array.isArray(body.steps);

  const withLines: RecipeStructuredData = {
    ...before,
    yield: body.yield !== undefined ? body.yield : before.yield,
    prep_time: body.prep_time !== undefined ? body.prep_time : before.prep_time,
    cook_time: body.cook_time !== undefined ? body.cook_time : before.cook_time,
    total_time:
      body.total_time !== undefined ? body.total_time : before.total_time,
    ingredients: patchesIngredients
      ? editIngredients(before.ingredients ?? [], body.ingredients ?? [])
      : (before.ingredients ?? []).map(copyIngredient),
    /* Derived, never client-writable: recomposed only when the lines change,
       so LLM prose that lives in the other block survives a one-sided edit. */
    ingredients_text: patchesIngredients
      ? (body.ingredients ?? []).join("\n")
      : before.ingredients_text,
    steps: patchesSteps
      ? editSteps(before.steps ?? [], body.steps ?? [])
      : (before.steps ?? []).map(copyStep),
    steps_text: patchesSteps
      ? (body.steps ?? []).join("\n")
      : before.steps_text,
  };

  const structuredData: RecipeStructuredData = {
    ...withLines,
    warnings: recomputeWarnings(before.warnings ?? [], withLines),
  };

  const title = body.title !== undefined ? body.title : knowledgeItem.title;

  return {
    knowledge_item: {
      ...knowledgeItem,
      title,
      summary:
        body.summary !== undefined ? body.summary : knowledgeItem.summary,
      structured_data: structuredData,
      review_reasons: buildReviewReasons(
        knowledgeItem.status,
        structuredData.warnings,
        {
          confidence: knowledgeItem.confidence,
          ingredients: structuredData.ingredients,
        },
      ),
      /* Stamped server-side on every successful patch (contract §1). */
      edited_at: new Date().toISOString(),
    },
    display: { ...item.display, title },
    source_citations: item.source_citations.map((citation) => ({
      ...citation,
    })),
  };
};

/* ---------- error envelopes, one per row of the contract's §3 table ---------- */

/* `details` uses `item_id`, matching the SHIPPED backend's guard stack
   (routes/review.py) — and, since 5.4's reconciliation, every other fixture
   and both contract docs. The review-side fixtures and v0.4 of the review
   contract spelled the same key differently; live probes of BOTH routes
   answer `{item_id}`, so the divergence PLAN D8 recorded is closed, not
   deliberate any more. Nothing FE-side keys on `details`. */

/** 400 — the body names no editable field at all (an empty patch). */
export const emptyPatchEnvelope = (itemId: string): ErrorEnvelope => ({
  error: {
    code: "invalid_request",
    message: "Request body names no editable field.",
    details: { item_id: itemId },
  },
});

/** 404 — unknown item id. */
export const knowledgeItemNotFoundEnvelope = (
  itemId: string,
): ErrorEnvelope => ({
  error: {
    code: "knowledge_item_not_found",
    message: `Knowledge item '${itemId}' not found.`,
    details: { item_id: itemId },
  },
});

/** 409 — the parent document is mid-reprocess. */
export const ingestionAlreadyRunningEnvelope = (
  documentId: string,
  status: string,
): ErrorEnvelope => ({
  error: {
    code: "ingestion_already_running",
    message: "Document is not in a terminal state.",
    details: { document_id: documentId, status },
  },
});

/** 409 — the item belongs to an older extraction generation. */
export const reviewItemStaleEnvelope = (
  itemId: string,
  sourceVersion: number,
  currentVersion: number,
): ErrorEnvelope => ({
  error: {
    code: "review_item_stale",
    message:
      "Knowledge item belongs to a stale extraction generation; editing is refused (reject to clear it).",
    details: {
      item_id: itemId,
      source_version: sourceVersion,
      current_source_version: currentVersion,
    },
  },
});

/** 404 — the item exists but is not awaiting review. */
export const reviewNotPendingEnvelope = (
  itemId: string,
  status: string,
): ErrorEnvelope => ({
  error: {
    code: "review_not_pending",
    message: `Knowledge item '${itemId}' is not awaiting review.`,
    details: { item_id: itemId, status },
  },
});

/** 401 — authentication is middleware, so it preempts even body validation. */
export const unauthorizedEnvelope: ErrorEnvelope = {
  error: {
    code: "unauthorized",
    message: "Authentication required.",
    details: {},
  },
};

/** 422 — the app's RequestValidationError handler RE-ENVELOPES FastAPI's
    validation errors (contract §3), so a 422 parses as one shape with the
    raw `exc.errors()` list under `details.errors`. Note it shares the code
    `invalid_request` with the empty-body 400: status is what separates them. */
export const validationFailedEnvelope = (
  errors: Record<string, unknown>[],
): ErrorEnvelope => ({
  error: {
    code: "invalid_request",
    message: "Request validation failed.",
    details: { errors },
  },
});

/* ---------- handlers ---------- */

const EDITABLE_KEYS = [
  "title",
  "summary",
  "yield",
  "prep_time",
  "cook_time",
  "total_time",
  "ingredients",
  "steps",
] as const;

const namesEditableField = (body: KnowledgeItemUpdateRequest): boolean =>
  EDITABLE_KEYS.some((key) => body[key] !== undefined);

/**
 * The route's guard stack, in the SHIPPED backend's evaluation order
 * (routes/review.py:263-279): unknown id → 404 `knowledge_item_not_found`,
 * THEN the empty-body 400, then (server-side only) the two 409s, then 404
 * `review_not_pending`. The empty-body 400 sits AFTER the 404 so an unknown
 * id reports as unknown whatever the body says.
 *
 * The two 409s are not modelled inline — they need document/generation state
 * the fixtures do not carry; register `knowledgeItemErrorHandler` per test.
 */
const patchResponse = (
  items: KnowledgeItemResponse[],
  itemId: string,
  body: KnowledgeItemUpdateRequest,
) => {
  const item = items.find(
    (candidate) => candidate.knowledge_item.id === itemId,
  );
  if (!item) {
    return {
      item: undefined,
      response: HttpResponse.json(knowledgeItemNotFoundEnvelope(itemId), {
        status: 404,
      }),
    };
  }
  if (!namesEditableField(body)) {
    return {
      item: undefined,
      response: HttpResponse.json(emptyPatchEnvelope(itemId), { status: 400 }),
    };
  }
  if (item.knowledge_item.status !== "needs_review") {
    return {
      item: undefined,
      response: HttpResponse.json(
        reviewNotPendingEnvelope(itemId, item.knowledge_item.status),
        { status: 404 },
      ),
    };
  }
  const patched = applyPatch(item, body);
  return { item: patched, response: HttpResponse.json(patched) };
};

/**
 * STATELESS PATCH handler — safe as a base handler. It answers from
 * `applyPatch` over a COPY and never writes back, so two consecutive tests
 * patching the same id both see the pristine fixture. `onRequest` records
 * each intercepted (id, body) pair for interaction asserts.
 */
export const knowledgeItemPatchHandler = (
  items: KnowledgeItemResponse[],
  onRequest?: (itemId: string, body: KnowledgeItemUpdateRequest) => void,
) =>
  http.patch("/api/v1/knowledge-items/:itemId", async ({ params, request }) => {
    const itemId = String(params.itemId);
    const body = (await request.json()) as KnowledgeItemUpdateRequest;
    onRequest?.(itemId, body);
    return patchResponse(items, itemId, body).response;
  });

/**
 * Per-test override for the rows the stateless handler cannot reach from
 * fixture state — the two 409s and the 422 (the `reprocessErrorHandler`
 * idiom). `body` is deliberately loose so a test can also answer with a
 * NON-envelope body and prove client.ts's `bad_response` fallback.
 */
export const knowledgeItemErrorHandler = (
  status: number,
  body: ErrorEnvelope | Record<string, unknown>,
) =>
  http.patch("/api/v1/knowledge-items/:itemId", () =>
    HttpResponse.json(body, { status }),
  );

/** The 401 needs its OWN handler: `unauthorizedHandler` in
    tests/msw/handlers.ts is `http.get(...)` only, so a PATCH against it falls
    through to `onUnhandledRequest: "error"` and fails the test with an
    unhandled-request message instead of a clean assertion. */
export const unauthorizedPatchHandler = (path: string) =>
  http.patch(path, () =>
    HttpResponse.json(unauthorizedEnvelope, { status: 401 }),
  );

/**
 * STATEFUL scenario factory: a GET+PATCH pair over a fresh mutable copy, so
 * a patch persists into a subsequent `GET /knowledge-items/{id}` and a second
 * patch stacks on the first. Unknown ids fall through (`undefined`) to the
 * base GET handler rather than shadowing the 2.2 read fixtures.
 *
 * NEVER register this as a base test handler: base handlers are created once
 * at module load and `server.resetHandlers()` does not reset closure state,
 * so edits would leak across tests. Use per-test via `server.use(...)` —
 * runtime handlers ARE removed by `resetHandlers()`.
 */
export const editScenario = (items: KnowledgeItemResponse[]) => {
  const state = new Map<string, KnowledgeItemResponse>(
    items.map((item) => [item.knowledge_item.id, item]),
  );
  return [
    http.get("/api/v1/knowledge-items/:itemId", ({ params }) => {
      const item = state.get(String(params.itemId));
      return item ? HttpResponse.json(item) : undefined;
    }),
    http.patch(
      "/api/v1/knowledge-items/:itemId",
      async ({ params, request }) => {
        const itemId = String(params.itemId);
        const body = (await request.json()) as KnowledgeItemUpdateRequest;
        const current = state.get(itemId);
        const { item, response } = patchResponse(
          current ? [current] : [],
          itemId,
          body,
        );
        if (item) {
          state.set(itemId, item);
        }
        return response;
      },
    ),
  ];
};

/* ---------- the manual create path (POST /knowledge-items) ---------- */

/** The fixed ids the backend's `ensure_manual_shelf` uses. Constants here
    rather than string literals in each test: the shelf is a real, named place
    in the product, and a test asserting the recipe landed on it should say so
    the same way the FE does. */
export const MANUAL_SHELF_DOCUMENT_ID = "doc_manual_shelf";
export const MANUAL_SHELF_TITLE = "Handwritten";

/**
 * Build the 201 body for a typed recipe — the mock's half of
 * `ingestion/manual.authored_recipe`.
 *
 * It reuses `editIngredients` / `editSteps` against an EMPTY existing list,
 * which is the same trick the server plays with `apply_edit`: every submitted
 * line is unmatched, so every line comes out human-authored (parse nulled,
 * confidences 1.0, `edited: true`). Warnings go through `recomputeWarnings`
 * from an empty base, so a recipe typed with no method carries `no_steps`
 * exactly as an extracted one would — including this module's documented
 * divergences, which is the point of not writing a second rule here.
 *
 * `status` is `indexing`, not `ready`: the server queues a chunk-and-embed
 * job and answers before it runs. A fixture that said `ready` would let a UI
 * that ignores the delay pass its tests.
 */
export const applyCreate = (
  id: string,
  body: KnowledgeItemCreateRequest,
): KnowledgeItemResponse => {
  const structuredData: RecipeStructuredData = {
    schema: "recipe.v1",
    yield: body.yield ?? null,
    prep_time: body.prep_time ?? null,
    cook_time: body.cook_time ?? null,
    total_time: body.total_time ?? null,
    ingredients: editIngredients([], body.ingredients ?? []),
    ingredients_text: (body.ingredients ?? []).join("\n"),
    steps: editSteps([], body.steps ?? []),
    steps_text: (body.steps ?? []).join("\n"),
  };
  structuredData.warnings = recomputeWarnings([], structuredData);

  return {
    knowledge_item: {
      id,
      document_id: MANUAL_SHELF_DOCUMENT_ID,
      item_type: "recipe",
      title: body.title,
      summary: body.summary ?? null,
      status: "indexing",
      /* No page was read, so there is no span to cite and no citation to
         build a subtitle tail out of. */
      source_span_ids: [],
      confidence: {
        overall: 1,
        boundary: 1,
        fields: { title: 1, summary: 1, yield: 1, ingredients: 1, steps: 1 },
      },
      structured_data: structuredData,
      /* `[]` regardless of the warnings above: the server projects reasons
         only for a `needs_review` item, and a typed recipe never is one. */
      review_reasons: [],
      edited_at: null,
      favourited_at: null,
    },
    display: { title: body.title, subtitle: MANUAL_SHELF_TITLE },
    source_citations: [],
  };
};

/**
 * STATEFUL scenario: POST creates, and the created item is then readable at
 * `GET /knowledge-items/{id}` — which is what the create page's own success
 * path needs, since it navigates straight to the recipe page.
 *
 * Same warning as `editScenario`: never register this as a base handler.
 * `server.resetHandlers()` removes runtime handlers but does not reset closure
 * state, so a created item would leak into the next test.
 */
export const createScenario = (
  onRequest?: (body: KnowledgeItemCreateRequest) => void,
) => {
  const created = new Map<string, KnowledgeItemResponse>();
  let counter = 0;
  return [
    http.post("/api/v1/knowledge-items", async ({ request }) => {
      const body = (await request.json()) as KnowledgeItemCreateRequest;
      onRequest?.(body);
      counter += 1;
      const item = applyCreate(`item_written_${counter}`, body);
      created.set(item.knowledge_item.id, item);
      return HttpResponse.json(item, { status: 201 });
    }),
    /* Falls through (`undefined`) for anything this scenario did not create,
       so the read fixtures behind it stay reachable. */
    http.get("/api/v1/knowledge-items/:itemId", ({ params }) => {
      const item = created.get(String(params.itemId));
      return item ? HttpResponse.json(item) : undefined;
    }),
  ];
};
