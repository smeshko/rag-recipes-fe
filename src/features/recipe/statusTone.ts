import type { PillTone } from "../../ui";

export interface StatusPresentation {
  tone: PillTone;
  label: string;
}

/* Total over the four backend statuses plus an honest fallback — never
   undefined, so an unrecognised status still renders as itself. */
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
    default:
      return { tone: "neutral", label: status };
  }
}
