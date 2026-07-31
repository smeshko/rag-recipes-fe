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
