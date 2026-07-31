import { HttpResponse, http } from "msw";

/* Knowledge-item detail fixtures (2.2). Shapes captured from the live
   backend; every variant here exists to prove a rendering branch. */

export const knowledgeItemNotFoundEnvelope = (itemId: string) => ({
  error: {
    code: "knowledge_item_not_found",
    message: `Knowledge item '${itemId}' not found.`,
    details: { knowledge_item_id: itemId },
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

export const needsReviewItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_review",
    status: "needs_review",
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
  },
  display: { title: "How to fold an omelet", subtitle: null },
  source_citations: [],
};

export const warningsItemFixture = {
  ...fullItemFixture,
  knowledge_item: {
    ...fullItemFixture.knowledge_item,
    id: "item_warned",
    structured_data: {
      ...fullItemFixture.knowledge_item.structured_data,
      warnings: ["yield inferred from step text"],
    },
  },
};

const byId: Record<string, unknown> = {
  item_full: fullItemFixture,
  item_sparse: sparseItemFixture,
  item_review: needsReviewItemFixture,
  item_superseded: supersededItemFixture,
  item_extracting: extractingItemFixture,
  item_extracting_empty: extractingEmptyItemFixture,
  item_nocite: zeroCitationItemFixture,
  item_dupes: duplicateLinesItemFixture,
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
