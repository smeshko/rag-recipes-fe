import { HttpResponse, http } from "msw";
import { buildReviewReasons } from "../../src/mocks/knowledgeItems";

/* Knowledge-item detail fixtures (2.2). Shapes captured from the live
   backend; every variant here exists to prove a rendering branch.

   `review_reasons` and `edited_at` were added in 5.4 (TASK-005): the backend
   has sent both on every detail payload since epic 21.1, and a fixture that
   omits them makes an unflagged-looking `needs_review` item the read page
   would render as "nothing is flagged any more". The projection is 5.2's
   `buildReviewReasons` rather than a second hand-written copy of the backend's
   message table — the codes live in `structured_data.warnings`, exactly as
   `build_review_reasons` reads them. */

export const knowledgeItemNotFoundEnvelope = (itemId: string) => ({
  error: {
    code: "knowledge_item_not_found",
    message: `Knowledge item '${itemId}' not found.`,
    details: { item_id: itemId },
  },
});

const ingredient = (
  position: number,
  rawText: string,
  itemText: string | null = null,
) => ({
  notes: null,
  position,
  raw_text: rawText,
  unit_raw: null,
  item_text: itemText,
  confidence: {
    item: 0.99,
    unit: 0.99,
    overall: 0.99,
    quantity: 0.99,
    normalization: 0.98,
  },
  preparation: null,
  quantity_text: null,
  quantity_value: null,
  item_normalized: itemText,
});

const step = (stepNumber: number, text: string) => ({
  text,
  confidence: { overall: 0.99, ordering: 0.99 },
  step_number: stepNumber,
  source_span_ids: ["span_full_item"],
});

const citation = (label: string) => ({
  source_span_id: "span_full_item",
  label,
  locator: {
    meta: {
      confidence: null,
      suspicious: false,
      extraction_method: "embedded_text",
      extractor_identity: "pymupdf:embedded_text",
    },
    type: "pdf_page_range",
    page_start: 22,
    page_end: 22,
  },
});

export const fullItemFixture = {
  knowledge_item: {
    id: "item_full",
    document_id: "doc_onepan",
    item_type: "recipe",
    title: "Spinach and Cheddar Frittata",
    summary:
      "A simple Italian-inspired frittata with spinach and sharp cheddar cheese — all the awesomeness of an omelet without the folding.",
    status: "ready",
    source_span_ids: ["span_full_item"],
    confidence: {
      fields: {
        steps: 0.98,
        title: 0.99,
        yield: 0.99,
        summary: 0.97,
        ingredients: 0.99,
      },
      overall: 0.98,
      boundary: 0.97,
    },
    structured_data: {
      schema: "recipe.v1",
      yield: "4–6 servings",
      cook_time: null,
      prep_time: null,
      total_time: "30 minutes",
      warnings: [],
      steps_text: "Preheat the oven to 375°F.\nAdd the olive oil…",
      ingredients_text:
        "2 Tbsp extra virgin olive oil\n1 small onion, peeled and diced\n8 large eggs",
      ingredients: [
        ingredient(
          1,
          "2 Tbsp extra virgin olive oil",
          "extra virgin olive oil",
        ),
        ingredient(2, "1 small onion, peeled and diced", "onion"),
        ingredient(3, "8 large eggs", "eggs"),
      ],
      steps: [
        step(1, "Preheat the oven to 375°F."),
        step(2, "Sauté the onion and spinach until wilted."),
        step(3, "Pour in the eggs and bake until puffy."),
      ],
    },
    /* A decided item: the backend projects an empty list, and nobody has
       edited it. Every fixture below spreads these and overrides where its
       own branch needs to. */
    review_reasons: [],
    edited_at: null,
  },
  display: {
    title: "Spinach and Cheddar Frittata",
    subtitle: "onepantorulethemall · page 22",
  },
  source_citations: [citation("page 22")],
};

/** Sparse: no parsed ingredients (text lines only), null times/confidence. */
export const sparseItemFixture = {
  knowledge_item: {
    id: "item_sparse",
    document_id: "doc_paleo",
    item_type: "recipe",
    title: "Rustic Campfire Beans",
    summary: null,
    status: "ready",
    source_span_ids: ["span_sparse"],
    confidence: null,
    structured_data: {
      schema: "recipe.v1",
      yield: null,
      cook_time: null,
      prep_time: null,
      total_time: null,
      warnings: [],
      steps_text: "Warm the beans.\nServe.",
      ingredients_text: "1 can beans\na pinch of salt",
      ingredients: [],
      steps: [],
    },
    review_reasons: [],
    edited_at: null,
  },
  display: { title: "Rustic Campfire Beans", subtitle: null },
  source_citations: [],
};

/** A line repeated verbatim — 9 of 118 live items do this (a second "1 tsp
    salt" for the sauce, etc.). Rows must stay individually addressable. */
export const duplicateLinesItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_dupes",
    structured_data: {
      ...fullItemFixture.knowledge_item.structured_data,
      ingredients: [
        ingredient(1, "1 tsp sea salt", "sea salt"),
        ingredient(2, "8 large eggs", "eggs"),
        ingredient(3, "1 tsp sea salt", "sea salt"),
      ],
    },
  },
};

/** Malformed steps: no live incidence, but the verbatim-dict type admits a
    null step_number and a textless row — both must degrade, not mislead. */
export const malformedStepsItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_badsteps",
    structured_data: {
      ...fullItemFixture.knowledge_item.structured_data,
      steps: [
        { text: "Warm the pan.", step_number: null, confidence: null },
        { text: null, step_number: null, confidence: null },
        { text: "Serve.", step_number: null, confidence: null },
      ],
    },
  },
};

/** Partially numbered steps. Sorting on `step_number ?? 0` would drag the
    unnumbered step to the front and change the cooking order. */
export const mixedNumberingItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_mixednum",
    structured_data: {
      ...fullItemFixture.knowledge_item.structured_data,
      steps: [
        { text: "Warm the pan.", step_number: 1, confidence: null },
        { text: "Add the eggs.", step_number: null, confidence: null },
        { text: "Serve.", step_number: 2, confidence: null },
      ],
    },
  },
};

/** Non-positive ordinals. The backend types step_number as a bare int with
    no lower bound, so 0 and -1 survive a clean model_dump; sorting on them
    reorders the method and renders "-1." as if it were authoritative. */
export const badOrdinalItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_badordinal",
    structured_data: {
      ...fullItemFixture.knowledge_item.structured_data,
      steps: [
        { text: "Warm the pan.", step_number: -1, confidence: null },
        { text: "Add the eggs.", step_number: 2, confidence: null },
        { text: "Serve.", step_number: 1, confidence: null },
      ],
    },
  },
};

/** A gap in otherwise sound numbering — extraction most likely dropped step
    3. The gap is preserved, not renumbered away. */
export const gappedNumberingItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_gapped",
    structured_data: {
      ...fullItemFixture.knowledge_item.structured_data,
      steps: [
        { text: "Warm the pan.", step_number: 1, confidence: null },
        { text: "Add the eggs.", step_number: 2, confidence: null },
        { text: "Serve.", step_number: 4, confidence: null },
      ],
    },
  },
};

/* Flagged for two reasons an edit cannot both clear — `warnings` carries the
   codes and `review_reasons` is their projection, the pairing the backend
   guarantees (a `needs_review` item is one whose warnings list is non-empty). */
const needsReviewWarnings = ["low_overall_confidence", "recipe_too_short"];

export const needsReviewItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_review",
    status: "needs_review",
    structured_data: {
      ...fullItemFixture.knowledge_item.structured_data,
      warnings: needsReviewWarnings,
    },
    review_reasons: buildReviewReasons("needs_review", needsReviewWarnings),
  },
};

/** A flagged item whose ingredient list repeats a line verbatim (5.3 D20).
    The edit form's row identity has to survive it: two rows, same text,
    different synthetic ids, edited independently. */
export const duplicateLinesReviewItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_review_dupes",
    status: "needs_review",
    structured_data: {
      ...fullItemFixture.knowledge_item.structured_data,
      warnings: ["low_overall_confidence"],
      ingredients: [
        ingredient(1, "1 tsp sea salt", "sea salt"),
        ingredient(2, "8 large eggs", "eggs"),
        ingredient(3, "1 tsp sea salt", "sea salt"),
      ],
    },
    review_reasons: buildReviewReasons("needs_review", [
      "low_overall_confidence",
    ]),
  },
};

/** The `no_ingredients` case this epic exists to repair (5.3 D20): flagged,
    with nothing for the reviewer to start from.

    `structured_data` is written out in full rather than spread from
    `fullItemFixture` on purpose — the parent carries `ingredients_text`, and
    inheriting it would make `ingredientLines` resolve `kind: "text"` with
    three lines, so the fixture would silently stop testing an empty list. */
export const emptyIngredientsReviewItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_review_empty",
    status: "needs_review",
    structured_data: {
      schema: "recipe.v1",
      yield: "4–6 servings",
      cook_time: null,
      prep_time: null,
      total_time: "30 minutes",
      warnings: ["no_ingredients"],
      ingredients: [],
      steps: [
        step(1, "Preheat the oven to 375°F."),
        step(2, "Sauté the onion and spinach until wilted."),
        step(3, "Pour in the eggs and bake until puffy."),
      ],
    },
    review_reasons: buildReviewReasons("needs_review", ["no_ingredients"]),
  },
};

export const supersededItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_superseded",
    status: "superseded",
  },
};

export const extractingItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_extracting",
    status: "extracting",
  },
};

/** Mid-ingest: extracting status with an empty structured_data — the honest
    copy is "Still being extracted…", not "none extracted". */
export const extractingEmptyItemFixture = {
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_extracting_empty",
    status: "extracting",
    confidence: null,
    structured_data: { schema: "recipe.v1" },
  },
  display: { title: "Half-read Frittata", subtitle: null },
  source_citations: [],
};

/** source_span_ids non-empty but citations silently dropped by the backend. */
export const zeroCitationItemFixture = {
  ...fullItemFixture,
  knowledge_item: { ...fullItemFixture.knowledge_item, id: "item_nocite" },
  source_citations: [],
};

/** A non-recipe schema opened at /recipes/:id — must NOT render as a recipe. */
export const nonRecipeItemFixture = {
  knowledge_item: {
    id: "item_technique",
    document_id: "doc_onepan",
    item_type: "technique",
    title: "How to fold an omelet",
    summary: null,
    status: "ready",
    source_span_ids: ["span_tech"],
    confidence: null,
    structured_data: { schema: "technique.v1" },
    review_reasons: [],
    edited_at: null,
  },
  display: { title: "How to fold an omelet", subtitle: null },
  source_citations: [],
};

/* `warnings` holds soft-validation CODES, not prose — see the backend's
   ingestion/validation.py — and persist.py sets needs_review if and only if
   that list is non-empty, so a warned item is always a needs_review item. */
export const warningsItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_warned",
    status: "needs_review",
    structured_data: {
      ...fullItemFixture.knowledge_item.structured_data,
      warnings: ["low_overall_confidence", "recipe_too_short"],
    },
    review_reasons: buildReviewReasons("needs_review", [
      "low_overall_confidence",
      "recipe_too_short",
    ]),
  },
};

const byId: Record<string, unknown> = {
  item_full: fullItemFixture,
  item_sparse: sparseItemFixture,
  item_review: needsReviewItemFixture,
  item_review_dupes: duplicateLinesReviewItemFixture,
  item_review_empty: emptyIngredientsReviewItemFixture,
  item_superseded: supersededItemFixture,
  item_extracting: extractingItemFixture,
  item_extracting_empty: extractingEmptyItemFixture,
  item_nocite: zeroCitationItemFixture,
  item_dupes: duplicateLinesItemFixture,
  item_badsteps: malformedStepsItemFixture,
  item_mixednum: mixedNumberingItemFixture,
  item_badordinal: badOrdinalItemFixture,
  item_gapped: gappedNumberingItemFixture,
  item_technique: nonRecipeItemFixture,
  item_warned: warningsItemFixture,
};

export const knowledgeItemHandlers = [
  http.get("/api/v1/knowledge-items/:itemId", ({ params }) => {
    const id = String(params.itemId);
    const fixture = byId[id];
    return fixture
      ? HttpResponse.json(fixture)
      : HttpResponse.json(knowledgeItemNotFoundEnvelope(id), { status: 404 });
  }),
];
