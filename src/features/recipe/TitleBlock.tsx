import type { KnowledgeItemResponse } from "../../api";
import { useDocument } from "../../api/documents";
import { Pill } from "../../ui";
import { LowScoreMark } from "./LowScoreMark";
import { lowFields } from "./reviewMarks";
import { statusTone } from "./statusTone";

export function TitleBlock({ item }: { item: KnowledgeItemResponse }) {
  const doc = useDocument(item.knowledge_item.document_id);
  const status = statusTone(item.knowledge_item.status);
  const pageLabel = item.source_citations[0]?.label;
  /* Field-level marks, needs_review only (thresholds are null otherwise): the
     extractor scored the title/summary it wrote, and a low one is the reviewer's
     cue to check the field against the page. */
  const low = lowFields(
    item.knowledge_item.confidence?.fields,
    item.knowledge_item.review_thresholds,
  );

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
        {low.title ? (
          <LowScoreMark mark={low.title} label="Title" testId="title-score" />
        ) : null}
      </h1>
      {item.knowledge_item.summary ? (
        <p className="mt-3 max-w-[720px] font-display text-[17px] text-fg-muted italic">
          {item.knowledge_item.summary}
          {low.summary ? (
            <LowScoreMark
              mark={low.summary}
              label="Summary"
              testId="summary-score"
            />
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
