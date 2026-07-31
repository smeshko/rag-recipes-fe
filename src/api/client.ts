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
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  /* Normalize through Headers: RequestInit.headers may be a record, a
     Headers instance or an array of tuples, and object spread preserves
     only the first. Accept is a default, so a caller-supplied one wins. */
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      "network_error",
      "The request never reached the shelf.",
      {},
      null,
    );
  }

  if (response.ok) {
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
