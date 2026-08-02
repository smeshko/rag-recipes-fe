/* HAND-AUTHORED STOPGAP — the committed src/api/schema.d.ts predates backend
   epic 22.2, so `paths["/api/v1/knowledge-items/{item_id}"]` still carries
   `patch?: never` and `route(…, "patch")` does not compile. The operation
   below is transcribed from docs/edit-api-contract.md §1 and modelled
   field-for-field on the generated
   `get_knowledge_item_api_v1_knowledge_items__item_id__get`, so phase 5.4's
   `just typegen` makes this file redundant rather than contradicted.

   DELETE THIS FILE in phase 5.4 and revert the one import line in routes.ts
   back to `./schema`; do not add anything else here.

   Why an Omit overlay rather than 4.2's `declare module "./schema"` module
   augmentation: the path key already exists with `patch?: never`, and a
   redeclaration is TS2717 ("subsequent property declarations must have the
   same type"). A plain intersection does not work either — `never`
   intersected with an operation collapses to `never`, which routes.ts's
   `ApiMethod` then drops. Omitting the key first is what lets the real
   operation take its place.

   Note routes.ts consumes only `parameters.path` and `parameters.query`;
   `requestBody` is declared for structural parity with the generated
   operation and is read by nothing. The patch body's type safety comes from
   annotating the literal with `KnowledgeItemUpdateRequest` at the call site. */

import type { components, paths as GeneratedPaths } from "./schema";
import type { KnowledgeItemUpdateRequest } from "./types";

/** The one path the overlay touches. */
type ItemPath = "/api/v1/knowledge-items/{item_id}";

/** `PATCH /api/v1/knowledge-items/{item_id}` — backend epic 22.2. */
export type UpdateKnowledgeItemOperation = {
  parameters: {
    query?: never;
    header?: never;
    path: {
      item_id: string;
    };
    cookie?: never;
  };
  requestBody: {
    content: {
      "application/json": KnowledgeItemUpdateRequest;
    };
  };
  responses: {
    /** @description Successful Response */
    200: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        "application/json": components["schemas"]["KnowledgeItemResponse"];
      };
    };
    /** @description Validation Error */
    422: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        "application/json": components["schemas"]["HTTPValidationError"];
      };
    };
  };
};

/**
 * The generated `paths` with the pending PATCH operation swapped in on the
 * knowledge-item route. Every other path, method and parameter is the
 * generated type untouched.
 */
export type ApiPaths = Omit<GeneratedPaths, ItemPath> & {
  [K in ItemPath]: Omit<GeneratedPaths[ItemPath], "patch"> & {
    patch: UpdateKnowledgeItemOperation;
  };
};
