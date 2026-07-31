/* Hand-written response types. The backend declares most response bodies as
   `unknown` in its OpenAPI schema (no FastAPI response_model), so these are
   modelled on observed responses and stay deliberately narrow. Request bodies
   ARE generated — import those from schema.d.ts, not here. */

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

export interface DocumentListItem {
  id: string;
  category: string;
  subcategory: string | null;
  title: string;
  author: string;
  source_type: string;
  status: string;
  active_source_version: number | null;
}

export interface DocumentListResponse {
  documents: DocumentListItem[];
}

export interface DocumentDetailResponse {
  document: DocumentListItem & {
    asset_id: string;
    language: string | null;
    created_at: string;
    updated_at: string;
  };
  counts: {
    source_spans: number;
    knowledge_items: number;
    ready_items: number;
    needs_review_items: number;
    chunks: number;
  };
}
