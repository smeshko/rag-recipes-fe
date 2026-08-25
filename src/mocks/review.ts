import { HttpResponse, http } from "msw";
import type {
  ErrorEnvelope,
  ReviewDecision,
  ReviewDecisionRequest,
  ReviewDecisionResponse,
  ReviewItem,
  ReviewListResponse,
} from "../api";

/* Review-queue TEST mocks (phase 4.2). The dev browser worker that once
   shared this module was removed in phase 4.4 (live endpoints); the only
   remaining importer is the node test server (`tests/msw/server.ts`), so
   msw never reaches the production bundle. Src-side placement is historical
   (4.2 DECISIONS.md D4) and kept to avoid churn. Payloads are transcribed
   from docs/review-api-contract.md field-for-field; types come from
   `src/api` so contract drift breaks compilation.

   Fixture hygiene: synthetic ids only — nothing here may reference the
   stranded dev-DB documents deleted by backend 21.2. Flag `code` values
   come ONLY from the 7 canonical `validate_soft` codes (opaque strings
   FE-side); `message` strings are realistic backend-style copy — the FE
   keeps NO code→copy table, so these fixtures are the only place the
   strings live. */

export const reviewItemsFixture: ReviewItem[] = [
  {
    /* Multi-page span; the epic's real worst book. */
    id: "ki_maple_cutouts",
    title: "Maple Cutout Cookies",
    summary: "Crisp maple-sweetened cutout cookies for decorating.",
    item_type: "recipe",
    status: "needs_review",
    document: { id: "doc_baking", title: "bakingwithlesssugar" },
    source_pages: { page_start: 41, page_end: 43 },
    extraction: {
      schema: "recipe.v1",
      yield: "24 cookies",
      top_ingredients: ["maple syrup", "flour", "butter"],
      confidence_overall: 0.62,
    },
    flags: [
      {
        code: "low_normalization_confidence",
        message: "Some ingredient lines could not be confidently normalized.",
      },
    ],
  },
  {
    /* Two flags on one item. */
    id: "ki_honey_oat_loaf",
    title: "Honey Oat Sandwich Loaf",
    summary: "A soft sandwich loaf sweetened with honey instead of sugar.",
    item_type: "recipe",
    status: "needs_review",
    document: { id: "doc_baking", title: "bakingwithlesssugar" },
    source_pages: { page_start: 57, page_end: 57 },
    extraction: {
      schema: "recipe.v1",
      yield: "1 loaf",
      top_ingredients: ["honey", "rolled oats", "bread flour"],
      confidence_overall: 0.48,
    },
    flags: [
      {
        code: "low_overall_confidence",
        message: "Overall extraction confidence is below the review threshold.",
      },
      {
        code: "recipe_too_short",
        message: "The extracted recipe has fewer steps than expected.",
      },
    ],
  },
  {
    /* Null summary/yield/confidence, empty top_ingredients. */
    id: "ki_pear_galette",
    title: "Rustic Pear Galette",
    summary: null,
    item_type: "recipe",
    status: "needs_review",
    document: { id: "doc_baking", title: "bakingwithlesssugar" },
    source_pages: { page_start: 88, page_end: 88 },
    extraction: {
      schema: "recipe.v1",
      yield: null,
      top_ingredients: [],
      confidence_overall: null,
    },
    flags: [
      {
        code: "low_overall_confidence",
        message: "Overall extraction confidence is below the review threshold.",
      },
    ],
  },
  {
    /* Null pages — the locator never resolved. */
    id: "ki_skillet_granola",
    title: "Stovetop Skillet Granola",
    summary: "Toasty granola made entirely in one skillet.",
    item_type: "recipe",
    status: "needs_review",
    document: { id: "doc_onepan", title: "onepantorulethemall" },
    source_pages: { page_start: null, page_end: null },
    extraction: {
      schema: "recipe.v1",
      yield: "4 cups",
      top_ingredients: ["oats", "almonds", "coconut oil"],
      confidence_overall: 0.55,
    },
    flags: [
      {
        code: "recipe_too_short",
        message: "The extracted recipe has fewer steps than expected.",
      },
    ],
  },
  {
    /* The one already-corrected row: a reviewer has edited it and the flags
       have not cleared, so the queue has an `edited_at` marker to render
       (5.4 D9). Stamp is fixed, never `new Date()` — a fixture that moves
       with the clock cannot be asserted verbatim. */
    id: "ki_paleo_dressing",
    edited_at: "2026-03-04T09:15:00.482913Z",
    title: "Everyday Paleo Salad Dressing",
    summary: "A sharp mustard-and-olive-oil dressing for weekday salads.",
    item_type: "recipe",
    status: "needs_review",
    document: { id: "doc_paleo", title: "eatdrinkpaleo" },
    source_pages: { page_start: 112, page_end: 112 },
    extraction: {
      schema: "recipe.v1",
      yield: "1 cup",
      top_ingredients: ["olive oil", "dijon mustard", "lemon juice"],
      confidence_overall: 0.59,
    },
    flags: [
      {
        code: "low_normalization_confidence",
        message: "Some ingredient lines could not be confidently normalized.",
      },
    ],
  },
];

/* ---------- error envelopes ---------- */

/** Same shape as `knowledgeItemNotFoundEnvelope` in tests/msw/knowledgeItems.ts
    (src cannot import from tests/ — see the module header). */
export const knowledgeItemNotFoundEnvelope = (
  itemId: string,
): ErrorEnvelope => ({
  error: {
    code: "knowledge_item_not_found",
    message: `Knowledge item '${itemId}' not found.`,
    details: { item_id: itemId },
  },
});

/** The confirmed-404 answer to deciding an already-decided item. */
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

/* ---------- handlers ---------- */

/** Filter + slice exactly as the backend pages: `document_id` filter first,
    then `limit`/`offset` over the filtered list (default limit 50 per the
    contract; the client always sends 200). */
const listResponse = (
  items: ReviewItem[],
  request: Request,
  onRequest?: (url: URL) => void,
): ReviewListResponse => {
  const url = new URL(request.url);
  onRequest?.(url);
  const documentId = url.searchParams.get("document_id");
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const filtered = documentId
    ? items.filter((item) => item.document.id === documentId)
    : items;
  return { review_items: filtered.slice(offset, offset + limit) };
};

const decisionResponse = (
  item: ReviewItem,
  decision: ReviewDecision,
): ReviewDecisionResponse => ({
  knowledge_item: {
    id: item.id,
    document_id: item.document.id,
    /* "indexing" is the async-approve transitional label from the contract —
       clients treat any non-`needs_review` status as "decided". */
    status: decision === "approved" ? "indexing" : "rejected",
  },
  decision,
});

/** STATELESS list handler (documentsListHandler clone). Safe as a base
    handler; `onRequest` records each intercepted URL for paging asserts. */
export const reviewItemsHandler = (
  items: ReviewItem[],
  onRequest?: (url: URL) => void,
) =>
  http.get("/api/v1/review-items", ({ request }) =>
    HttpResponse.json(listResponse(items, request, onRequest)),
  );

/** STATELESS decision handler. Known id → 200; unknown → 404
    `knowledge_item_not_found`. Deliberately no decided-state: deciding twice
    answers 200 twice, so it can live in the base handler array without
    leaking closure state across tests (see `reviewScenario`). */
export const reviewDecisionHandler = (
  items: ReviewItem[],
  onRequest?: (itemId: string, body: ReviewDecisionRequest) => void,
) =>
  http.post(
    "/api/v1/knowledge-items/:itemId/review",
    async ({ params, request }) => {
      const itemId = String(params.itemId);
      const body = (await request.json()) as ReviewDecisionRequest;
      onRequest?.(itemId, body);
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) {
        return HttpResponse.json(knowledgeItemNotFoundEnvelope(itemId), {
          status: 404,
        });
      }
      return HttpResponse.json(decisionResponse(item, body.decision));
    },
  );

/**
 * STATEFUL scenario factory: a GET+POST pair closing over a fresh decided-map
 * (the `statusQueueHandler` closure idiom). A decided item leaves the GET
 * list — which still honors `document_id`/`limit`/`offset` exactly like the
 * stateless handler — and a second POST answers 404 `review_not_pending`
 * carrying the item's post-decision status.
 *
 * NEVER register this as a base test handler: base handlers are created once
 * at module load and `server.resetHandlers()` does not reset closure state,
 * so decisions would leak across tests. Use per-test via `server.use(...)` —
 * runtime handlers ARE removed by `resetHandlers()`. (The dev browser worker
 * that also seeded this scenario was removed in phase 4.4.)
 */
export const reviewScenario = (items: ReviewItem[]) => {
  /** id → the status the decision produced (for `review_not_pending`). */
  const decided = new Map<string, string>();
  return [
    http.get("/api/v1/review-items", ({ request }) => {
      const pending = items.filter((item) => !decided.has(item.id));
      return HttpResponse.json(listResponse(pending, request));
    }),
    http.post(
      "/api/v1/knowledge-items/:itemId/review",
      async ({ params, request }) => {
        const itemId = String(params.itemId);
        const body = (await request.json()) as ReviewDecisionRequest;
        const item = items.find((candidate) => candidate.id === itemId);
        if (!item) {
          return HttpResponse.json(knowledgeItemNotFoundEnvelope(itemId), {
            status: 404,
          });
        }
        const decidedStatus = decided.get(itemId);
        if (decidedStatus !== undefined) {
          return HttpResponse.json(
            reviewNotPendingEnvelope(itemId, decidedStatus),
            { status: 404 },
          );
        }
        const response = decisionResponse(item, body.decision);
        decided.set(itemId, response.knowledge_item.status);
        return HttpResponse.json(response);
      },
    ),
  ];
};
