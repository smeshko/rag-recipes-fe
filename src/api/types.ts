/* Response types. Since backend 21.1 every route declares a response_model,
   so the generated schema.d.ts carries typed response bodies — the review
   section below re-exports them. The remaining hand-written interfaces here
   (search, documents, uploads, knowledge items, answers) predate that and are
   legacy pending a follow-up sweep to generated types; they are modelled on
   observed responses and stay deliberately narrow. Request bodies ARE
   generated — import those from schema.d.ts, not here. */

import type { components } from "./schema";

/** The uniform error envelope every non-2xx response carries. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    /** Always present — the backend defaults it to {}. */
    details: Record<string, unknown>;
  };
}

export interface HealthResponse {
  status: string;
}

/* ---------- search ---------- */

export type SearchMode = "hybrid" | "keyword" | "vector";

export interface SourceCitation {
  source_span_id: string;
  label: string;
  locator: {
    type: string;
    page_start: number | null;
    page_end: number | null;
    meta: Record<string, unknown>;
  } | null;
}

export interface KnowledgeItemResult {
  type: "knowledge_item_result";
  item: {
    id: string;
    item_type: string;
    schema: string;
    title: string;
    summary: string | null;
    status: string;
    confidence: {
      fields: Record<string, number>;
      overall: number | null;
      boundary: number | null;
    } | null;
  };
  display: {
    title: string;
    subtitle: string | null;
    snippet: string | null;
    badges: string[];
  };
  structured_preview: {
    schema: string;
    yield: string | null;
    top_ingredients: string[];
  } | null;
  document: { id: string; title: string; author: string };
  matched_chunks: { chunk_id: string; chunk_type: string; score: number }[];
  source_citations: SourceCitation[];
}

export interface SearchResponse {
  query: string;
  results: KnowledgeItemResult[];
}

/* ---------- documents ---------- */

/** Pipeline order first, then the three terminal states (storage/enums.py). */
export type DocumentStatus =
  | "queued"
  | "extracting_text"
  | "creating_source_spans"
  | "extracting_items"
  | "validating_items"
  | "creating_chunks"
  | "embedding_chunks"
  | "indexing"
  | "ready"
  | "needs_review"
  | "failed";

export const TERMINAL_STATUSES = [
  "ready",
  "needs_review",
  "failed",
] as const satisfies readonly DocumentStatus[];

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

/* The list item is deliberately smaller than DocumentResponse (no asset_id,
   language or timestamps) — keep the two shapes distinct, never merge them
   into one optional-field type. `title`/`author` are non-nullable in the
   backend models; the nullable fields are `subcategory`, `language` and
   `active_source_version`. */
export interface DocumentListItem {
  id: string;
  category: string;
  subcategory: string | null;
  title: string;
  author: string;
  source_type: string;
  status: DocumentStatus;
  active_source_version: number | null;
}

export interface DocumentListResponse {
  documents: DocumentListItem[];
}

export interface DocumentResponse {
  id: string;
  asset_id: string;
  category: string;
  subcategory: string | null;
  title: string;
  author: string;
  source_type: string;
  language: string | null;
  active_source_version: number | null;
  status: DocumentStatus;
  created_at: string;
  updated_at: string;
}

/* POST /documents answers 201 with this shape for BOTH fresh creates and
   content-hash duplicates — the backend serializes no duplicate marker, so
   created-vs-duplicate is classified client-side by prior id membership. */
export interface UploadResponse {
  document: DocumentResponse;
  ingestion: { status: DocumentStatus };
}

/* POST /documents/batch — per-file wire result. Batch `status` is
   authoritative (the backend content-hash check names duplicates itself);
   `error` carries only the backend's message string, never a code. */
export interface BatchUploadItemResult {
  filename: string;
  status: "created" | "duplicate" | "error";
  document_id: string | null;
  error: string | null;
}

export interface BatchUploadResponse {
  items: BatchUploadItemResult[];
  total: number;
  created: number;
  duplicates: number;
  errors: number;
}

/* GET /documents/{id}/status. `progress.stage` mirrors `status` verbatim and
   `progress.message` is hardcoded null today (verified backend source) —
   typed honestly, but no client logic keys on `stage`. `pages_processed`
   counts existing source spans; `pages_total` is null until spans exist —
   and a reuse-mode reprocess reports (0, null) for its entire run by design.
   `terminal` is computed server-side for ready/needs_review/failed. */
export interface IngestionStatusResponse {
  document_id: string;
  status: DocumentStatus;
  active_source_version: number | null;
  current_source_version: number | null;
  progress: {
    stage: string;
    message: string | null;
    pages_total: number | null;
    pages_processed: number | null;
  };
  terminal: boolean;
}

/* POST /documents/{id}/reprocess — 200 answer; the guarded update yields a
   409 `ingestion_already_running` envelope for non-terminal documents. */
export interface ReprocessResponse {
  document_id: string;
  status: "queued";
  previous_active_source_version: number | null;
  current_source_version: number | null;
}

export interface DocumentCounts {
  source_spans: number;
  knowledge_items: number;
  ready_items: number;
  needs_review_items: number;
  chunks: number;
}

export interface DocumentDetailResponse {
  document: DocumentResponse;
  counts: DocumentCounts;
}

/* ---------- knowledge items (2.2) ---------- */

/** Per-ingredient parse — verbatim pass-through, treat as untrusted. */
export interface Ingredient {
  position?: number | null;
  raw_text?: string | null;
  item_text?: string | null;
  item_normalized?: string | null;
  unit_raw?: string | null;
  unit_normalized?: string | null;
  quantity_text?: string | null;
  quantity_value?: number | null;
  preparation?: string | null;
  notes?: string | null;
  confidence?: Record<string, number> | null;
}

export interface Step {
  step_number?: number | null;
  text?: string | null;
  confidence?: Record<string, number> | null;
  source_span_ids?: string[] | null;
}

/** The real confidence shape — members optional (verbatim pass-through). */
export interface ItemConfidence {
  overall?: number | null;
  boundary?: number | null;
  fields?: Record<string, number> | null;
}

/* Defensive mirror of recipe.v1: every field optional/nullable because the
   backend passes the stored dict verbatim. `schema` stays a plain string so
   future recipe.v* versions still render what matches; non-recipe schemas
   get the honest not-a-recipe state instead (2.2 TASK-004). */
export interface RecipeStructuredData {
  schema?: string;
  yield?: string | null;
  prep_time?: string | null;
  cook_time?: string | null;
  total_time?: string | null;
  ingredients?: Ingredient[] | null;
  ingredients_text?: string | null;
  steps?: Step[] | null;
  steps_text?: string | null;
  /** Appended at persist time; absent from the Pydantic model. */
  warnings?: string[] | null;
}

export interface KnowledgeItemResponse {
  knowledge_item: {
    id: string;
    document_id: string;
    item_type: string;
    title: string;
    summary: string | null;
    status: string;
    source_span_ids: string[];
    confidence: ItemConfidence | null;
    structured_data: RecipeStructuredData;
  };
  display: { title: string; subtitle: string | null };
  source_citations: SourceCitation[];
}

/* ---------- review (4.2, generated since 4.4) ---------- */

/* Generated re-exports, no longer hand-written: aliases into the backend's
   review schemas (epic 21.3) under the names 4.2 introduced, so consumers
   compile unchanged. The structural check at each alias IS the drift
   tripwire — never hand-patch a divergence here; reconcile it through
   docs/review-api-contract.md instead. */

/** `code` is a backend-owned enum treated as an opaque string; `message` is backend-authored copy rendered verbatim. */
export type ReviewFlag = components["schemas"]["ReviewReason"];

/** `flags` is non-empty by definition — an unflagged item is not in this list. */
export type ReviewItem = components["schemas"]["ReviewItem"];

export type ReviewListResponse =
  components["schemas"]["ReviewItemListResponse"];

export type ReviewDecision = components["schemas"]["ReviewDecision"];

export type ReviewDecisionRequest = components["schemas"]["ReviewRequest"];

/* `knowledge_item.status` (and the echoed `decision`) are plain strings, NOT
   literal unions: approve is async (202-style) and the backend may answer a
   transitional label (e.g. `indexing`) before settling to `ready`. The FE
   contract is "any non-`needs_review` status means decided". */
export type ReviewDecisionResponse = components["schemas"]["ReviewResponse"];

/* ---------- answers (2.3) ---------- */

export interface AnswerBody {
  style: string;
  text: string;
  citations: string[];
}

export interface Recommendation {
  knowledge_item_id: string;
  title: string;
  reason: string;
  citation_ids: string[];
}

export interface AnswerCitation {
  citation_id: string;
  knowledge_item_id: string;
  source_span_id: string;
  label: string;
}

export interface AnswerResponse {
  query: string;
  answer: AnswerBody;
  recommendations: Recommendation[];
  citations: AnswerCitation[];
  /** Populated on fallback despite include_results: false. */
  results: KnowledgeItemResult[];
  warnings: string[];
}
