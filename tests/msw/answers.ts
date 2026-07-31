import { HttpResponse, http } from "msw";
import type { AnswerResponse, KnowledgeItemResult } from "../../src/api/types";
import { searchFixture } from "./handlers";

/* Answer fixtures (2.3). IMPORTANT: LLM technical failures, parse errors,
   citation-validation errors and payload-construction errors are all 200
   FALLBACKS by design (answers/service.py:174-213) — never model them as
   5xx. Fallback shape: answer.text === warnings[0], citations and
   recommendations empty, results populated on FALLBACK_WARNING despite
   include_results: false.

   These are exported per-test handler FACTORIES, not global handlers — a
   globally-registered /answers handler would make the never-auto-fire spy
   assertion vacuous. */

/** Grounded text copied VERBATIM from a live response — real Markdown shape:
    \n\n paragraphs, **bold** names, a numbered list, bracketed [cite_N]. */
export const groundedAnswerFixture: AnswerResponse = {
  query: "a proper weekend breakfast for guests",
  answer: {
    style: "recommendation",
    text: "For a proper weekend breakfast with guests, three recipes stand out:\n\n1. **Fruit-Stuffed French Toast** (6 servings) — A showstopper stuffed with cream cheese, yogurt, and fresh berries, pan-fried golden and finished in the oven, then served with powdered sugar and warm maple syrup. It's elegant yet approachable and scales well for a group. [cite_1]\n\n2. **Hazelnut Pancakes with Blood Orange Sauce** (12 pancakes) — Fluffy paleo pancakes paired with a warm blood orange and vanilla butter sauce. The recipe notes these are preferred by many over standard pancakes, making them a memorable guest dish. [cite_4]\n\n3. **Banana Cinnamon Bread Pudding** (6–8 servings) — A warmly spiced, honey-sweetened bake served with unsweetened whipped cream. It can be prepared ahead and served warm or cold, which is ideal when hosting. [cite_8]",
    citations: ["cite_1", "cite_4", "cite_8"],
  },
  recommendations: [
    {
      knowledge_item_id: "item_frenchtoast",
      title: "Fruit-Stuffed French Toast",
      reason: "A guest-worthy stuffed French toast; yields 6 servings.",
      citation_ids: ["cite_1"],
    },
    {
      knowledge_item_id: "item_pancakes",
      title: "Hazelnut Pancakes with Blood Orange Sauce",
      reason: "Makes 12 — the memorable centerpiece.",
      citation_ids: ["cite_4"],
    },
    {
      knowledge_item_id: "item_breadpudding",
      title: "Banana Cinnamon Bread Pudding",
      reason: "Bake ahead; serves 6–8 warm or cold.",
      citation_ids: ["cite_8"],
    },
  ],
  citations: [
    {
      citation_id: "cite_1",
      knowledge_item_id: "item_frenchtoast",
      source_span_id: "span_ft",
      label: "pp. 33–35",
    },
    {
      citation_id: "cite_4",
      knowledge_item_id: "item_pancakes",
      source_span_id: "span_hp",
      label: "p. 28",
    },
    {
      citation_id: "cite_8",
      knowledge_item_id: "item_breadpudding",
      source_span_id: "span_bp",
      label: "pp. 32–33",
    },
  ],
  results: [],
  warnings: [],
};

/** Parenthesised (cite_N) variant + a recommendation citing an id the text
    doesn't — citations[] strictly larger than answer.citations. */
export const groundedParenFixture: AnswerResponse = {
  ...groundedAnswerFixture,
  answer: {
    ...groundedAnswerFixture.answer,
    text: "Start with the **Fruit-Stuffed French Toast** (cite_1) and bake ahead.",
    citations: ["cite_1"],
  },
};

/* Backend constants copied verbatim (answers/service.py:56-61). */
export const FALLBACK_WARNING =
  "I found relevant results, but could not generate a citation-safe answer. Here are the retrieved items instead.";
export const NO_RESULTS_WARNING =
  "No relevant results were found for this query.";

export const fallbackWithResultsFixture: AnswerResponse = {
  query: "which wine pairs with this",
  answer: {
    style: "recommendation",
    text: FALLBACK_WARNING,
    citations: [],
  },
  recommendations: [],
  citations: [],
  results: searchFixture("which wine pairs with this")
    .results as unknown as KnowledgeItemResult[],
  warnings: [FALLBACK_WARNING],
};

export const fallbackNoResultsFixture: AnswerResponse = {
  ...fallbackWithResultsFixture,
  answer: { ...fallbackWithResultsFixture.answer, text: NO_RESULTS_WARNING },
  results: [],
  warnings: [NO_RESULTS_WARNING],
};

export const answersHandler = (fixture: AnswerResponse) =>
  http.post("/api/v1/answers", () => HttpResponse.json(fixture));

export const answersErrorHandler = (
  code: "unauthorized" | "invalid_request" | "internal_error",
) => {
  const byCode = {
    unauthorized: {
      status: 401,
      message: "Authentication required.",
      details: {},
    },
    invalid_request: {
      status: 400,
      message: "Query must not be empty.",
      details: { field: "query" },
    },
    internal_error: {
      status: 500,
      message: "Something went wrong on the shelf.",
      details: {},
    },
  }[code];
  return http.post("/api/v1/answers", () =>
    HttpResponse.json(
      { error: { code, message: byCode.message, details: byCode.details } },
      { status: byCode.status },
    ),
  );
};
