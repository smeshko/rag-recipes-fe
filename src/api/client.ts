import type { Endpoint } from "./routes";
import type { ErrorEnvelope } from "./types";

const BASE = "/api/v1";

/* No parameter properties — tsconfig's erasableSyntaxOnly rejects them. */
export class ApiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  /** HTTP status, or null when the request never got a response. */
  readonly status: number | null;

  constructor(
    code: string,
    message: string,
    details: Record<string, unknown>,
    status: number | null,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return false;
  }
  const err = (body as { error: unknown }).error;
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { code?: unknown }).code === "string" &&
    typeof (err as { message?: unknown }).message === "string"
  );
}

/**
 * Thin fetch wrapper over the relative /api/v1 base. Knows exactly two
 * things: the error envelope and the base path. No auth — the dev proxy
 * (and later the production front) injects credentials server-side.
 *
 * The target is an `Endpoint` from `route()`, which carries the path and the
 * schema-declared method, so an unchecked path or a method the backend does
 * not serve cannot get here. `init` therefore cannot set `method`. The
 * response type stays a caller assertion — the backend declares no
 * response_models.
 */
export async function request<T>(
  endpoint: Endpoint,
  init?: Omit<RequestInit, "method">,
): Promise<T> {
  /* Normalize through Headers: RequestInit.headers may be a record, a
     Headers instance or an array of tuples, and object spread preserves
     only the first. Accept is a default, so a caller-supplied one wins. */
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${endpoint.path}`, {
      ...init,
      method: endpoint.method,
      headers,
    });
  } catch {
    throw new ApiError(
      "network_error",
      "The request never reached the shelf.",
      {},
      null,
    );
  }

  if (response.ok) {
    /* 204 carries no body, so `response.json()` would reject with a raw
       SyntaxError — outside the fetch try/catch above, so it would escape as
       something that is not an ApiError and defeat every `instanceof ApiError`
       check downstream. The per-recipe DELETE is the first 204 the app calls;
       `DELETE /documents/{id}` has been in the schema unused since 21.2 and
       would have hit exactly this. Callers of a 204 route type T as `void`. */
    if (
      response.status === 204 ||
      response.headers.get("Content-Length") === "0"
    ) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (isErrorEnvelope(body)) {
    const { code, message, details } = body.error;
    throw new ApiError(code, message, details ?? {}, response.status);
  }
  throw new ApiError(
    "bad_response",
    `Unexpected ${response.status} response without an error envelope.`,
    {},
    response.status,
  );
}
