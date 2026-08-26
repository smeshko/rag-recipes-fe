import type { PillTone } from "./Pill";

export interface StatusPresentation {
  tone: PillTone;
  label: string;
}

/* Total over the backend statuses plus an honest fallback — never undefined,
   so an unrecognised status still renders as itself.

   `indexing` and `rejected` were unreachable from the read page (which only
   ever showed settled items) until the per-book listing started rendering a
   whole book at once; without them both fell to the default and printed a raw
   snake_case status. */
export function statusTone(status: string): StatusPresentation {
  switch (status) {
    case "ready":
      return { tone: "ok", label: "Ready" };
    case "needs_review":
      return { tone: "warn", label: "Needs review" };
    case "superseded":
      return { tone: "neutral", label: "Superseded" };
    case "extracting":
      return { tone: "working", label: "Extracting" };
    case "indexing":
      return { tone: "working", label: "Indexing" };
    case "rejected":
      return { tone: "failed", label: "Rejected" };
    default:
      return { tone: "neutral", label: status };
  }
}
