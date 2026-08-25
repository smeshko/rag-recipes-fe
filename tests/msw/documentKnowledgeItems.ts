import { HttpResponse, http } from "msw";
import type { ErrorEnvelope, KnowledgeItemSummary } from "../../src/api";

/* Fixtures + handlers for the per-book contents listing and the per-recipe
   delete. Test-only, so they live here rather than in `src/mocks/` (whose
   src-side placement is historical — see the note in src/mocks/review.ts).

   Payloads are transcribed from the backend's own schema; the types come from
   `src/api`, so a contract drift breaks compilation rather than a test. */

const ROW = (
  id: string,
  title: string,
  status: string,
  extra: Partial<KnowledgeItemSummary> = {},
): KnowledgeItemSummary => ({
  id,
  title,
  summary: `A short line about ${title.toLowerCase()}.`,
  item_type: "recipe",
  status,
  document: { id: "book-one-pan", title: "One Pan to Rule Them All" },
  source_pages: { page_start: 42, page_end: 43 },
  extraction: {
    schema: "recipe.v1",
    yield: "Serves 4",
    top_ingredients: ["butter", "flour"],
    confidence_overall: 0.81,
  },
  flags: [],
  edited_at: null,
  ...extra,
});

export const BOOK_ID = "book-one-pan";

/** A book mid-life: mostly shelved, one still flagged, one being re-indexed. */
export const bookItemsFixture: KnowledgeItemSummary[] = [
  ROW("item_skillet_chicken", "Skillet Chicken", "ready"),
  ROW("item_sheet_pan_salmon", "Sheet Pan Salmon", "ready", {
    edited_at: "2026-08-20T10:00:00Z",
    /* A single-page span and a null summary — the two degrades the row has to
       render without inventing anything. */
    source_pages: { page_start: 88, page_end: 88 },
    summary: null,
  }),
  ROW("item_braised_beans", "Braised Beans", "needs_review", {
    flags: [{ code: "no_steps", message: "This recipe has no method steps." }],
  }),
  ROW("item_slow_lamb", "Slow Lamb", "indexing"),
];

/**
 * The listing handler: filters by `status` and pages by `limit`/`offset`
 * exactly as the backend does, so the client's page-walk is exercised for
 * real rather than mocked away.
 */
export const documentKnowledgeItemsHandler = (
  documentId: string,
  items: KnowledgeItemSummary[],
  onRequest?: (url: URL) => void,
) =>
  http.get(`/api/v1/documents/${documentId}/knowledge-items`, ({ request }) => {
    const url = new URL(request.url);
    onRequest?.(url);
    const status = url.searchParams.get("status");
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const filtered = status
      ? items.filter((item) => item.status === status)
      : items;
    return HttpResponse.json({
      knowledge_items: filtered.slice(offset, offset + limit),
    });
  });

/** Any status/envelope pair, for the 404-book and outage arms. */
export const documentKnowledgeItemsErrorHandler = (
  documentId: string,
  status: number,
  envelope: ErrorEnvelope,
) =>
  http.get(`/api/v1/documents/${documentId}/knowledge-items`, () =>
    HttpResponse.json(envelope, { status }),
  );

/**
 * 204 with an empty body — the shape the client's no-content branch reads.
 *
 * STATEFUL on purpose: it splices the item out of the array the listing
 * handler serves from. A stateless 204 would let the delete hook's own
 * invalidation refetch the row straight back, and the test would then be
 * asserting the optimistic removal against a list that immediately undoes it —
 * green for the wrong reason, or red for a bug that is not there. Pass a
 * per-test copy of the fixture, never the shared one.
 */
export const knowledgeItemDeleteHandler = (
  items: KnowledgeItemSummary[],
  onDelete?: (itemId: string) => void,
) =>
  http.delete("/api/v1/knowledge-items/:itemId", ({ params }) => {
    const id = String(params.itemId);
    const at = items.findIndex((item) => item.id === id);
    if (at === -1) {
      return HttpResponse.json(
        {
          error: {
            code: "knowledge_item_not_found",
            message: `Knowledge item '${id}' not found.`,
            details: { item_id: id },
          },
        },
        { status: 404 },
      );
    }
    items.splice(at, 1);
    onDelete?.(id);
    return new HttpResponse(null, { status: 204 });
  });

export const knowledgeItemDeleteErrorHandler = (
  status: number,
  envelope: ErrorEnvelope,
) =>
  http.delete("/api/v1/knowledge-items/:itemId", () =>
    HttpResponse.json(envelope, { status }),
  );

export const documentNotFoundEnvelope = (id: string): ErrorEnvelope => ({
  error: {
    code: "document_not_found",
    message: `Document '${id}' not found.`,
    details: { document_id: id },
  },
});

export const ingestionRunningEnvelope = (id: string): ErrorEnvelope => ({
  error: {
    code: "ingestion_already_running",
    message: "Document is not in a terminal state.",
    details: { document_id: id, status: "extracting_items" },
  },
});
