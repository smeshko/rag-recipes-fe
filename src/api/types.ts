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
