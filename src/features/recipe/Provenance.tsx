import type { KnowledgeItemResponse } from "../../api";
import { useDocument } from "../../api/documents";

export function Provenance({ item }: { item: KnowledgeItemResponse }) {
  const doc = useDocument(item.knowledge_item.document_id);
  const label = item.source_citations[0]?.label;
  const overall = item.knowledge_item.confidence?.overall;
  const schema = item.knowledge_item.structured_data.schema;
  /* "nothing here was invented" is a categorical claim the payload itself can
     falsify: soft-validation appends `warnings` at persist time for exactly
     the fields it inferred (e.g. "yield inferred from step text"), and the
     facts row then shows an inferred value under a no-invention guarantee.
     Withdraw the guarantee when warnings exist rather than overclaim. The
     warning list itself stays undisplayed — PLAN.md Out of Scope. */
  const inferred =
    (item.knowledge_item.structured_data.warnings ?? []).length > 0;

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
        {inferred
          ? " — the original wording is preserved, though some details were inferred during extraction."
          : " — the original wording is preserved; nothing here was invented."}
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
