import { HttpResponse, http } from "msw";
import type {
  BatchUploadResponse,
  DocumentDetailResponse,
  DocumentListItem,
  DocumentResponse,
  DocumentStatus,
  ErrorEnvelope,
  IngestionStatusResponse,
  UploadResponse,
} from "../../src/api";
import { TERMINAL_STATUSES } from "../../src/api";

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
/* ------------------------------------------------------------------ */
/* Documents fixtures — the five mockup books (design/sk-library.html). */
/* Every documents handler below is a per-test `server.use()` override, */
/* NEVER a base `handlers` entry: the parallel epic-02 branch registers */
/* its own base GET /api/v1/documents fixture, and MSW resolves in      */
/* array order — two base handlers on one route silently shadow one.    */
/* ------------------------------------------------------------------ */

interface LibraryBookFixture {
  list: DocumentListItem;
  detail: DocumentDetailResponse;
}

const book = (
  id: string,
  title: string,
  status: DocumentListItem["status"],
  counts: DocumentDetailResponse["counts"],
  options: { subcategory?: string; author?: string; created_at?: string } = {},
): LibraryBookFixture => {
  const list: DocumentListItem = {
    id,
    category: "recipes",
    subcategory: options.subcategory ?? null,
    title,
    author: options.author ?? "Unknown",
    source_type: "pdf",
    status,
    active_source_version:
      status === "queued" || status === "failed" ? null : 1,
  };
  return {
    list,
    detail: {
      document: {
        ...list,
        asset_id: `asset-${id}`,
        language: "en",
        created_at: options.created_at ?? "2026-07-30T10:00:00Z",
        updated_at: options.created_at ?? "2026-07-30T10:00:00Z",
      },
      counts,
    },
  };
};

/** The mockup roster: header math is 3 books ready · 269 recipes · 15 waiting. */
export const libraryBooks: LibraryBookFixture[] = [
  book(
    "book-green-roasting-tin",
    "The Green Roasting Tin",
    "queued",
    {
      source_spans: 0,
      knowledge_items: 0,
      ready_items: 0,
      needs_review_items: 0,
      chunks: 0,
    },
    {
      subcategory: "one-pan vegetarian",
      author: "Rukmini Iyer",
      created_at: "2026-07-31T09:56:00Z",
    },
  ),
  book(
    "book-one-pan",
    "One Pan to Rule Them All",
    "ready",
    {
      source_spans: 270,
      knowledge_items: 108,
      ready_items: 107,
      needs_review_items: 1,
      chunks: 535,
    },
    { author: "America's Test Kitchen", created_at: "2026-07-28T18:12:00Z" },
  ),
  book(
    "book-eat-drink-paleo",
    "Eat Drink Paleo",
    "ready",
    {
      source_spans: 226,
      knowledge_items: 105,
      ready_items: 105,
      needs_review_items: 0,
      chunks: 520,
    },
    { author: "Irena Macri", created_at: "2026-07-25T08:30:00Z" },
  ),
  book(
    "book-baking-less-sugar",
    "Baking with Less Sugar",
    "needs_review",
    {
      source_spans: 203,
      knowledge_items: 71,
      ready_items: 57,
      needs_review_items: 14,
      chunks: 285,
    },
    { author: "Joanne Chang", created_at: "2026-07-22T15:45:00Z" },
  ),
  book(
    "book-modernist-bread",
    "modernist-bread-vol2.pdf",
    "failed",
    {
      source_spans: 0,
      knowledge_items: 0,
      ready_items: 0,
      needs_review_items: 0,
      chunks: 0,
    },
    { author: "Nathan Myhrvold", created_at: "2026-07-20T11:00:00Z" },
  ),
];

export const libraryBookList: DocumentListItem[] = libraryBooks.map(
  (b) => b.list,
);

export const libraryBookDetails: Record<string, DocumentDetailResponse> =
  Object.fromEntries(libraryBooks.map((b) => [b.list.id, b.detail]));

/**
 * Per-test paginating list handler: serves `books` in `limit`/`offset`
 * slices exactly as the backend does. Optional `onRequest` records each
 * intercepted URL so tests can assert the loop's paging behaviour.
 */
export const documentsListHandler = (
  books: DocumentListItem[],
  onRequest?: (url: URL) => void,
) =>
  http.get("/api/v1/documents", ({ request }) => {
    const url = new URL(request.url);
    onRequest?.(url);
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    return HttpResponse.json({
      documents: books.slice(offset, offset + limit),
    });
  });

/**
 * Per-test detail handler for one document id. `server.use()` prepends,
 * so it outranks the base 404 catch-all below.
 */
export const documentDetailHandler = (
  id: string,
  detail: DocumentDetailResponse,
) => http.get(`/api/v1/documents/${id}`, () => HttpResponse.json(detail));

/** Register the whole five-book shelf: list + every detail. */
export const libraryShelfHandlers = () => [
  documentsListHandler(libraryBookList),
  ...libraryBooks.map((b) => documentDetailHandler(b.list.id, b.detail)),
];

/* ------------------------------------------------------------------ */
/* Upload fixtures (phase 3.2). Envelopes below were captured from the */
/* live backend on 2026-08-01 (curl against :8001) — byte-for-byte.    */
/*                                                                     */
/* jsdom/undici multipart limit (verified by spike): field NAMES, part */
/* COUNTS and SCALAR values survive into a handler's formData(), but   */
/* the file part's filename and bytes do not. Handlers therefore only  */
/* record names/counts/scalars, and which envelope a test receives is  */
/* chosen by registering the fixture — never by inspecting content.    */
/* ------------------------------------------------------------------ */

export const unsupportedFileTypeEnvelope = {
  error: {
    code: "unsupported_file_type",
    message: "Only PDF uploads are supported.",
    details: { expected: "application/pdf" },
  },
};

export const missingFileEnvelope = {
  error: {
    code: "invalid_request",
    message: "A 'file' multipart field is required.",
    details: { field: "file" },
  },
};

export const internalErrorEnvelope = {
  error: {
    code: "internal_error",
    message: "Something went wrong storing the document.",
    details: {},
  },
};

/** What an upload handler can observe under jsdom — nothing file-content-y. */
export interface ObservedUpload {
  contentType: string | null;
  fieldNames: string[];
  category: FormDataEntryValue | null;
  /** Part count under the multi-file field name `files`. */
  filesPartCount: number;
}

const observeUpload = async (request: Request): Promise<ObservedUpload> => {
  const fd = await request.formData();
  return {
    contentType: request.headers.get("content-type"),
    fieldNames: [...fd.keys()],
    category: fd.get("category"),
    filesPartCount: fd.getAll("files").length,
  };
};

/** A fresh queued document as POST /documents returns it (201, no marker). */
export const uploadedDocument = (
  id: string,
  title: string,
): DocumentResponse => ({
  id,
  asset_id: `asset-${id}`,
  category: "recipes",
  subcategory: null,
  title,
  author: "Unknown",
  source_type: "pdf",
  language: null,
  active_source_version: null,
  status: "queued",
  created_at: "2026-08-01T09:00:00Z",
  updated_at: "2026-08-01T09:00:00Z",
});

/**
 * 201 single-upload handler. The duplicate response is byte-identical in
 * shape to a create (no flag) — pass an existing fixture document to model
 * a content-hash hit, a fresh one to model a create.
 */
export const uploadDocumentHandler = (
  document: DocumentResponse,
  onUpload?: (observed: ObservedUpload) => void,
) =>
  http.post("/api/v1/documents", async ({ request }) => {
    onUpload?.(await observeUpload(request));
    const body: UploadResponse = {
      document,
      ingestion: { status: document.status },
    };
    return HttpResponse.json(body, { status: 201 });
  });

/** Error-envelope handler for POST /documents (415, 400, 500 …). */
export const uploadErrorHandler = (
  status: number,
  envelope: ErrorEnvelope,
  onUpload?: (observed: ObservedUpload) => void,
) =>
  http.post("/api/v1/documents", async ({ request }) => {
    onUpload?.(await observeUpload(request));
    return HttpResponse.json(envelope, { status });
  });

/** The batch refusal when the Anthropic path is disabled — 409, generic code. */
export const batchNotEnabledEnvelope = {
  error: {
    code: "invalid_request",
    message:
      "Batch upload requires the Anthropic batch path (LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY).",
    details: {},
  },
};

/*
 * 201 batch handler. The response states its OWN items[].filename values —
 * never derived from the received parts, which under jsdom would all read
 * "blob" and enshrine a harness artifact as the contract.
 */
export const uploadBatchHandler = (
  response: BatchUploadResponse,
  onUpload?: (observed: ObservedUpload) => void,
) =>
  http.post("/api/v1/documents/batch", async ({ request }) => {
    onUpload?.(await observeUpload(request));
    return HttpResponse.json(response, { status: 201 });
  });

/** Error-envelope handler for POST /documents/batch (409 refusal, 500 …). */
export const uploadBatchErrorHandler = (
  status: number,
  envelope: ErrorEnvelope,
  onUpload?: (observed: ObservedUpload) => void,
) =>
  http.post("/api/v1/documents/batch", async ({ request }) => {
    onUpload?.(await observeUpload(request));
    return HttpResponse.json(envelope, { status });
  });

/* ------------------------------------------------------------------ */
/* Ingestion status fixtures (phase 3.3). `stage` mirrors `status` and */
/* `message` is null exactly as the live backend serves them.          */
/* ------------------------------------------------------------------ */

/** Build a status payload the way the backend does. */
export const ingestionStatus = (
  id: string,
  status: DocumentStatus,
  progress: {
    pages_total?: number | null;
    pages_processed?: number | null;
    message?: string | null;
  } = {},
): IngestionStatusResponse => ({
  document_id: id,
  status,
  active_source_version:
    status === "ready" || status === "needs_review" ? 1 : null,
  current_source_version: 1,
  progress: {
    stage: status,
    message: progress.message ?? null,
    pages_total: progress.pages_total ?? null,
    pages_processed: progress.pages_processed ?? null,
  },
  terminal: (TERMINAL_STATUSES as readonly string[]).includes(status),
});

/**
 * Per-test sequenced status queue: each request consumes one payload in
 * order. Once EXHAUSTED it answers 500 — never `undefined`, which would
 * fall through to the real network instead of tripping
 * `onUnhandledRequest: 'error'`, silently passing a stray poll.
 */
export const statusQueueHandler = (
  id: string,
  queue: IngestionStatusResponse[],
  onRequest?: () => void,
) => {
  const remaining = [...queue];
  return http.get(`/api/v1/documents/${id}/status`, () => {
    onRequest?.();
    const payload = remaining.shift();
    if (payload === undefined) {
      return HttpResponse.json(internalErrorEnvelope, { status: 500 });
    }
    return HttpResponse.json(payload);
  });
};

/** A document parked forever on one payload (stall / long-extraction tests). */
export const statusParkedHandler = (
  id: string,
  payload: IngestionStatusResponse,
  onRequest?: () => void,
) =>
  http.get(`/api/v1/documents/${id}/status`, () => {
    onRequest?.();
    return HttpResponse.json(payload);
  });

/** Error-envelope handler for GET /documents/{id}/status (404, 500 …). */
export const statusErrorHandler = (
  id: string,
  status: number,
  envelope: ErrorEnvelope,
  onRequest?: () => void,
) =>
  http.get(`/api/v1/documents/${id}/status`, () => {
    onRequest?.();
    return HttpResponse.json(envelope, { status });
  });

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
