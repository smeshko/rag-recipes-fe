import { HttpResponse, http } from "msw";

/* Fixtures mirror the live backend's shapes byte-for-byte — the 401 body was
   captured from an unauthenticated GET /api/v1/health, the search/documents
   shapes from authenticated calls against the real DB. */

export const healthOk = { status: "ok" };

export const unauthorizedEnvelope = {
  error: {
    code: "unauthorized",
    message: "Authentication required.",
    details: {},
  },
};

export const documentNotFoundEnvelope = (documentId: string) => ({
  error: {
    code: "document_not_found",
    message: `Document '${documentId}' not found.`,
    details: { document_id: documentId },
  },
});

/** Per-test override: make any GET path answer with the 401 envelope. */
export const unauthorizedHandler = (path: string) =>
  http.get(path, () =>
    HttpResponse.json(unauthorizedEnvelope, { status: 401 }),
  );

/* ---------- documents ---------- */

const documentListItem = (id: string, title: string, status = "ready") => ({
  id,
  category: "recipes",
  subcategory: null,
  title,
  author: "",
  source_type: "pdf",
  status,
  active_source_version: 1,
});

export const documentsFixture = {
  documents: [
    documentListItem("doc_onepan", "onepantorulethemall"),
    documentListItem("doc_paleo", "eatdrinkpaleo"),
    documentListItem("doc_baking", "bakingwithlesssugar"),
  ],
};

const detailCounts: Record<
  string,
  {
    source_spans: number;
    knowledge_items: number;
    ready_items: number;
    needs_review_items: number;
    chunks: number;
  }
> = {
  doc_onepan: {
    source_spans: 270,
    knowledge_items: 108,
    ready_items: 107,
    needs_review_items: 1,
    chunks: 535,
  },
  doc_paleo: {
    source_spans: 250,
    knowledge_items: 106,
    ready_items: 105,
    needs_review_items: 1,
    chunks: 510,
  },
  doc_baking: {
    source_spans: 140,
    knowledge_items: 60,
    ready_items: 57,
    needs_review_items: 3,
    chunks: 280,
  },
};

export const documentDetailFixture = (id: string) => {
  const counts = detailCounts[id];
  if (!counts) {
    return undefined;
  }
  const listItem = documentsFixture.documents.find((d) => d.id === id);
  return {
    document: {
      ...listItem,
      asset_id: `asset_${id}`,
      language: null,
      created_at: "2026-06-09T12:40:33.601447Z",
      updated_at: "2026-06-09T13:25:06.667160Z",
    },
    counts,
  };
};

/** Sum of ready_items across the three-book fixture: 107 + 105 + 57. */
export const fixtureReadyRecipes = 269;

/* ---------- search ---------- */

const searchResult = (opts: {
  id: string;
  title: string;
  summary: string;
  documentId: string;
  documentTitle: string;
  page: string;
  badges: string[];
  topIngredients: string[];
  yieldText: string | null;
}) => ({
  type: "knowledge_item_result",
  item: {
    id: opts.id,
    item_type: "recipe",
    schema: "recipe.v1",
    title: opts.title,
    summary: opts.summary,
    status: "ready",
    confidence: {
      fields: { title: 0.99, summary: 0.97 },
      overall: 0.98,
      boundary: 0.97,
    },
  },
  display: {
    title: opts.title,
    subtitle: `${opts.documentTitle} · ${opts.page}`,
    snippet: opts.summary,
    badges: opts.badges,
  },
  structured_preview: {
    schema: "recipe.preview.v1",
    yield: opts.yieldText,
    top_ingredients: opts.topIngredients,
  },
  document: { id: opts.documentId, title: opts.documentTitle, author: "" },
  matched_chunks: [
    {
      chunk_id: `chunk_${opts.id}`,
      chunk_type: "recipe_summary",
      score: 0.016,
    },
  ],
  source_citations: [
    {
      source_span_id: `span_${opts.id}`,
      label: opts.page,
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
    },
  ],
});

export const searchFixture = (query: string) => ({
  query,
  results: [
    searchResult({
      id: "item_frittata",
      title: "Spinach & Cheddar Frittata",
      summary:
        "All the awesomeness of an omelet without the folding — stovetop then baked until puffy.",
      documentId: "doc_onepan",
      documentTitle: "onepantorulethemall",
      page: "page 22",
      badges: ["4–6 servings", "30 minutes"],
      topIngredients: ["eggs", "baby spinach", "sharp cheddar", "onion"],
      yieldText: "4–6 servings",
    }),
    /* Empty badges/top_ingredients/yield prove optional rendering. */
    searchResult({
      id: "item_pancakes",
      title: "Hazelnut Pancakes with Blood Orange Sauce",
      summary:
        "Fluffy paleo hazelnut pancakes with a warm blood orange and vanilla butter sauce.",
      documentId: "doc_paleo",
      documentTitle: "eatdrinkpaleo",
      page: "pages 33–35",
      badges: [],
      topIngredients: [],
      yieldText: null,
    }),
  ],
});

/** Per-test override: zero-hit search. */
export const emptySearchHandler = () =>
  http.post("/api/v1/search", async ({ request }) => {
    const body = (await request.json()) as { query: string };
    return HttpResponse.json({ query: body.query, results: [] });
  });

/** Per-test override: generic failure with a real backend code. */
export const searchErrorHandler = () =>
  http.post("/api/v1/search", () =>
    HttpResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Something went wrong on the shelf.",
          details: {},
        },
      },
      { status: 500 },
    ),
  );

/** Per-test override: what /search actually returns for a bad mode. */
export const searchInvalidHandler = () =>
  http.post("/api/v1/search", () =>
    HttpResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "Unsupported search mode 'sideways'.",
          details: { mode: "sideways" },
        },
      },
      { status: 400 },
    ),
  );

export const handlers = [
  http.get("/api/v1/health", () => HttpResponse.json(healthOk)),
  http.post("/api/v1/search", async ({ request }) => {
    const body = (await request.json()) as { query: string };
    return HttpResponse.json(searchFixture(body.query));
  }),
  http.get("/api/v1/documents", () => HttpResponse.json(documentsFixture)),
  /* Known-id detail (with counts) must precede the catch-all 404 — MSW v2 is
     first-match-wins. Unknown ids fall through by returning undefined. */
  http.get("/api/v1/documents/:documentId", ({ params }) => {
    const detail = documentDetailFixture(String(params.documentId));
    return detail ? HttpResponse.json(detail) : undefined;
  }),
  http.get("/api/v1/documents/:documentId", ({ params }) =>
    HttpResponse.json(documentNotFoundEnvelope(String(params.documentId)), {
      status: 404,
    }),
  ),
];
