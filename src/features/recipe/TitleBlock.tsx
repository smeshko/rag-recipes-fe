import type { KnowledgeItemResponse } from "../../api";
import { useDocument } from "../../api/documents";
import { Pill } from "../../ui";
import { statusTone } from "./statusTone";

export function TitleBlock({ item }: { item: KnowledgeItemResponse }) {
  const doc = useDocument(item.knowledge_item.document_id);
  const status = statusTone(item.knowledge_item.status);
  const pageLabel = item.source_citations[0]?.label;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {doc.isSuccess ? (
          <Pill size="md" tone="book" uppercase>
            {doc.data.document.title}
          </Pill>
        ) : (
          /* Neutral shimmer slot so the bookline doesn't reflow; the item
             query drives the page — a failing document query just omits
             the book pill. */
          doc.isFetching && (
            <span
              aria-hidden="true"
              className="h-[29px] w-28 animate-pulse rounded-pill bg-skeleton/60"
            />
          )
        )}
        {pageLabel ? (
          <Pill size="md" tone="working">
            {pageLabel}
          </Pill>
        ) : null}
        <Pill size="md" tone={status.tone}>
          {status.label}
        </Pill>
      </div>
      <h1 className="mt-4 font-display text-[clamp(30px,4vw,42px)] font-semibold leading-[1.15] tracking-[-0.01em]">
        {item.display.title}
      </h1>
      {item.knowledge_item.summary ? (
        <p className="mt-3 max-w-[720px] font-display text-[17px] text-fg-muted italic">
          {item.knowledge_item.summary}
        </p>
      ) : null}
    </div>
  );
}
