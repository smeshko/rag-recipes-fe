import type { DocumentStatus } from "../../api";
import type { PillTone } from "../../ui";

const REVIEW_PARAM = "review";
const REVIEW_INCLUDED = "included";

/**
 * Reader of the search screen's arming param (`/?review=included`, which
 * sets filters.exclude_needs_review: false). The library link that emitted
 * it is retired — BookRow points at `/review?document=<id>` now — so the
 * reader serves hand-typed/legacy URLs only (`SearchPage.tsx` imports it).
 */
export function isReviewIncluded(params: URLSearchParams): boolean {
  return params.get(REVIEW_PARAM) === REVIEW_INCLUDED;
}

/** Books that show a counts row: processing is done enough to have items. */
export function isReadyIsh(status: DocumentStatus): boolean {
  return status === "ready" || status === "needs_review";
}

export interface StatusPillSpec {
  tone: PillTone;
  label: string;
}

/**
 * The mockup's pill mapping. The needs-review pill drops the number, never
 * the pill, while its count has not arrived (the count rides on the detail
 * response) — a pill with a blank where N goes is worse than no number.
 */
export function statusPill(
  status: DocumentStatus,
  needsReviewCount: number | undefined,
): StatusPillSpec {
  switch (status) {
    case "ready":
      return { tone: "ok", label: "Ready" };
    case "needs_review":
      return {
        tone: "warn",
        label:
          needsReviewCount === undefined
            ? "Needs review"
            : /* The mockup's "14 need review" reads as "1 need review" at a
                 count of one — a state a real shelf reaches often. */
              `${needsReviewCount} ${needsReviewCount === 1 ? "needs" : "need"} review`,
      };
    case "failed":
      return { tone: "failed", label: "Failed" };
    default:
      return { tone: "working", label: "Processing" };
  }
}

const ACCENT_ROTATION = ["bg-sage", "bg-terra-ink", "bg-butter-ink"] as const;

/**
 * Spine accent: status overrides first (working → apricot, failed → danger),
 * otherwise a stable pick from the rotation by hashing the document id —
 * index cycling would recolor every book when one is added.
 */
export function spineAccent(status: DocumentStatus, id: string): string {
  if (status === "failed") {
    return "bg-danger";
  }
  if (!isReadyIsh(status)) {
    return "bg-apricot";
  }
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) % ACCENT_ROTATION.length;
  }
  return ACCENT_ROTATION[hash];
}
