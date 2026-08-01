/* HAND-AUTHORED STOPGAP — the review endpoints do not exist in the backend's
   OpenAPI schema yet (backend epic 21.3). These two `paths` entries are
   transcribed from docs/review-api-contract.md and merged into the generated
   `schema.d.ts` so `route()` accepts the review routes with full param/query
   typing. DELETE THIS FILE in phase 4.4 when `just typegen` emits the real
   routes; do not add anything else here. */

declare module "./schema" {
  interface paths {
    "/api/v1/review-items": {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      /** List Review Items — only `get` is declared, so `ApiMethod` resolves to exactly "get". */
      get: {
        parameters: {
          /* limit/offset as `string | null`, mirroring
             list_documents_api_v1_documents_get exactly. */
          query?: {
            document_id?: string | null;
            limit?: string | null;
            offset?: string | null;
          };
          header?: never;
          path?: never;
          cookie?: never;
        };
        requestBody?: never;
        responses: {
          /** @description Successful Response */
          200: {
            headers: {
              [name: string]: unknown;
            };
            content: {
              "application/json": unknown;
            };
          };
        };
      };
    };
    "/api/v1/knowledge-items/{item_id}/review": {
      parameters: {
        query?: never;
        header?: never;
        path?: never;
        cookie?: never;
      };
      /** Decide Review Item — only `post` is declared, so `ApiMethod` resolves to exactly "post". */
      post: {
        parameters: {
          query?: never;
          header?: never;
          path: {
            item_id: string;
          };
          cookie?: never;
        };
        responses: {
          /** @description Successful Response */
          200: {
            headers: {
              [name: string]: unknown;
            };
            content: {
              "application/json": unknown;
            };
          };
        };
      };
    };
  }
}

/* A relative specifier in `declare module` is only legal in a module file
   (TS2436 otherwise) — this export is what makes the file one. */
export {};
