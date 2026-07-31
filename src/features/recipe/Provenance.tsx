import type { KnowledgeItemResponse } from "../../api";
import { useDocument } from "../../api/documents";

export function Provenance({ item }: { item: KnowledgeItemResponse }) {
  const doc = useDocument(item.knowledge_item.document_id);
  const label = item.source_citations[0]?.label;
  const overall = item.knowledge_item.confidence?.overall;
  const schema = item.knowledge_item.structured_data.schema;

  return (
    <div
      className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-line px-7 py-6"
      style={{ background: "var(--gradient-warm)" }}
    >
      <p className="text-[13.5px] text-ink-soft">
        Extracted
        {doc.isSuccess ? (
          <>
            {" "}
            from <b className="text-ink">{doc.data.document.title}</b>
          </>
        ) : null}
        {label ? <>, {label}</> : null}
        {/* A claim scoped to what this app can actually vouch for: it renders
            the extraction verbatim (D4 — raw_text unmodified, no client-side
            re-bolding). It deliberately does NOT vouch for the extraction
            itself. "nothing here was invented" did, and neither branch of the
            payload can support that: `warnings` carries soft-validation CODES
            (no_steps, low_overall_confidence, recipe_too_short — see
            backend ingestion/validation.py), which neither prove invention nor,
            when absent, prove its absence. Items that did trip validation are
            already flagged to the reader by the status pill: persist.py sets
            needs_review if and only if warnings is non-empty. */}
        {" — shown exactly as extracted; nothing here was rewritten."}
      </p>
      <p className="flex flex-wrap gap-4 text-[12.5px] text-ink-faint">
        {schema ? (
          <span>
            schema <b className="text-ink-soft">{schema}</b>
          </span>
        ) : null}
        {typeof overall === "number" ? (
          <span>
            confidence <b className="text-ink-soft">{overall.toFixed(2)}</b>
          </span>
        ) : null}
        <span>
          {item.source_citations.length} of{" "}
          {item.knowledge_item.source_span_ids.length} spans
        </span>
      </p>
    </div>
  );
}
