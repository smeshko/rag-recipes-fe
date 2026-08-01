import type { components } from "./schema";

/**
 * The one armed-filter body, shared by `POST /search` and `POST /answers` —
 * both take the same `SearchFilters` shape with the same
 * `exclude_needs_review: true` default, and arming one but not the other is
 * exactly the half-wired state review round 2 caught.
 *
 * `SearchFilters` has no partial form (the generated type marks all three
 * members required), so arming the flag means restating `item_type` and
 * `document_ids`. Both are set to the server's own defaults, which makes the
 * armed body a strict superset of the default one rather than a behaviour
 * change on any other axis.
 */
export const REVIEW_INCLUDED_FILTERS: components["schemas"]["SearchFilters"] = {
  item_type: "recipe",
  document_ids: [],
  exclude_needs_review: false,
};
