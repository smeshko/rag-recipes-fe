import type { KnowledgeItemResponse } from "../../api";
import { useDocument } from "../../api/documents";

export function Provenance({ item }: { item: KnowledgeItemResponse }) {
  const doc = useDocument(item.knowledge_item.document_id);
  const label = item.source_citations[0]?.label;
  const overall = item.knowledge_item.confidence?.overall;
  const schema = item.knowledge_item.structured_data.schema;

  return (
    <div
      className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-border px-7 py-6"
      style={{ background: "var(--gradient-warm)" }}
    >
      <p className="text-[13.5px] text-fg-muted">
        Extracted
        {doc.isSuccess ? (
          <>
            {" "}
            from <b className="text-fg">{doc.data.document.title}</b>
          </>
        ) : null}
        {label ? <>, {label}</> : null}.
        {/* Attribution only — no fidelity guarantee. The mockup's "the original
            wording is preserved; nothing here was invented" (sk-recipe.html:291)
            is sample copy this screen cannot honour on either side: it does not
            vouch for the extraction (warnings carries validation CODES, whose
            presence proves no invention and whose absence disproves none), and
            it cannot even vouch for the renderer, which trims text-fallback
            lines, orders ingredients by `position`, and substitutes sequential
            numbers when step numbering is untrustworthy.

            Overriding unsupportable mockup copy is this plan's own established
            practice: D3 drops the mockup's equipment fact because recipe.v1 has
            no such field, and the meta line replaces its "1 source span" with
            "{n} of {m} spans" for exactly this honesty reason. What the reader
            needs is carried by things that are true: the status pill (needs_review
            iff the payload has warnings) and the confidence figure beside it. */}
      </p>
      <p className="flex flex-wrap gap-4 text-[12.5px] text-fg-subtle">
        {schema ? (
          <span>
            schema <b className="text-fg-muted">{schema}</b>
          </span>
        ) : null}
        {typeof overall === "number" ? (
          <span>
            confidence <b className="text-fg-muted">{overall.toFixed(2)}</b>
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
