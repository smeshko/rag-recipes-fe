import type { DocumentStatus } from "../../api";

/**
 * The seven-stage pipeline as data, in backend order (storage/enums.py).
 * The stepper derives from `status` — the typed field — never from
 * `progress.stage`, which merely mirrors it as a plain string.
 */
export const PIPELINE_STAGES = [
  { status: "extracting_text", label: "Text" },
  { status: "creating_source_spans", label: "Spans" },
  { status: "extracting_items", label: "Extract" },
  { status: "validating_items", label: "Validate" },
  { status: "creating_chunks", label: "Chunks" },
  { status: "embedding_chunks", label: "Embed" },
  { status: "indexing", label: "Index" },
] as const;

export type StageState = "done" | "now" | "pending";

/**
 * Index-based mapping: done = before the current status, now = at it.
 * `queued` (and anything not in the pipeline) → all pending. This natively
 * handles the reuse-reprocess shortcut — a jump straight to
 * `extracting_items` implicitly marks Text and Spans done.
 */
export function stageStates(status: DocumentStatus): StageState[] {
  const currentIndex = PIPELINE_STAGES.findIndex((s) => s.status === status);
  return PIPELINE_STAGES.map((_, index) => {
    if (currentIndex === -1) {
      return "pending";
    }
    if (index < currentIndex) {
      return "done";
    }
    return index === currentIndex ? "now" : "pending";
  });
}

/* Human labels for the progress line. `queued` is non-terminal — it renders
   the progress variant — but is not one of the seven pipeline stages, so it
   needs its own label or the row shows a blank line. */
const STAGE_LABELS: Partial<Record<DocumentStatus, string>> = {
  queued: "Queued",
  extracting_text: "Extracting text",
  creating_source_spans: "Scanning pages",
  extracting_items: "Extracting recipes",
  validating_items: "Validating recipes",
  creating_chunks: "Creating chunks",
  embedding_chunks: "Embedding chunks",
  indexing: "Indexing",
};

export function stageLabel(status: DocumentStatus): string {
  return STAGE_LABELS[status] ?? "Processing";
}
