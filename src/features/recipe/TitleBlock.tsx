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
          /* Sentence case. A book title is a proper noun someone chose —
             upper-casing it is the retired language's small-caps habit, and
             the target has no small caps anywhere. */
          <Pill size="md" tone="book">
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
        {/* Every status EXCEPT ready. "Ready" is the expected state of a
            recipe you just opened, so a chip saying so is a permanent label
            that never varies and carries nothing — while "Needs review",
            "Extracting" or "Rejected" all change what the reader should do.
            Hiding the no-op case is what makes the others read as signal. */}
        {item.knowledge_item.status === "ready" ? null : (
          <Pill size="md" tone={status.tone}>
            {status.label}
          </Pill>
        )}
      </div>
      {/* One fixed size, no clamp. A fluid 30–42px display title was the
          loudest thing on the page, and it grew precisely where there was
          least room for it — the viewport width it scaled with is also the
          width the two panels below have to share. 26px/semibold reads as the
          head of a document at every width, which is what it is. */}
      <h1 className="mt-4 text-[26px] font-semibold leading-[1.25] tracking-[-0.02em]">
        {item.display.title}
        {low.title ? (
          <LowScoreMark mark={low.title} label="Title" testId="title-score" />
        ) : null}
      </h1>
      {item.knowledge_item.summary ? (
        /* Body text, not a pull quote: the summary is the extractor's own
           sentence about the recipe, and setting it in oversized italics
           dressed a machine-written line as an epigraph. */
        <p className="mt-3 max-w-[720px] text-[15px] text-fg-muted">
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
