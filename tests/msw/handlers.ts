import { HttpResponse, http } from "msw";

/* Fixtures mirror the live backend's envelope byte-for-byte — the 401 body
   below was captured from an unauthenticated GET /api/v1/health. */

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

export const handlers = [
  http.get("/api/v1/health", () => HttpResponse.json(healthOk)),
  http.get("/api/v1/documents/:documentId", ({ params }) =>
    HttpResponse.json(documentNotFoundEnvelope(String(params.documentId)), {
      status: 404,
    }),
  ),
];
