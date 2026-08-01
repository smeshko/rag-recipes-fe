import {
  isIndeterminateFailure,
  type UploadOutcomeItem,
  type UploadSummary,
} from "../../api";

/* Inline results under the dropzone — a deliberate design extension: the
   mockup has no results area, so tone rules come from the plan. Duplicates
   are NEVER an error: calm role="status" text. Only true failures get
   role="alert" danger styling. */

export interface UploadOutcomeProps {
  summary: UploadSummary | null;
  /** Mutation-level rejection (batch 500 etc.) — no per-file items exist. */
  error: Error | null;
}

/* The sequential path carries the ApiError code; the batch path carries only
   the backend's message string — render that verbatim rather than fragile
   reverse-mapping of message text to codes. */
/* A lost response is not a refusal: the book may already be on the shelf
   (which the mutation re-fetches on exactly this outcome), so the copy must
   not claim it failed outright. */
const INDETERMINATE_COPY =
  "The shelf never answered — if the book was added it will appear below.";

function errorCopy(item: UploadOutcomeItem): string {
  if (item.code === "unsupported_file_type") {
    return "Only PDFs can join the shelf";
  }
  if (item.indeterminate) {
    return INDETERMINATE_COPY;
  }
  return item.error ?? "The upload failed.";
}

function SingleOutcome({ item }: { item: UploadOutcomeItem }) {
  if (item.status === "duplicate") {
    return (
      <p role="status" className="mt-3 text-[13.5px] text-ink-soft">
        <em className="not-italic font-semibold">
          {item.title ?? item.filename}
        </em>{" "}
        is already on the shelf — nothing was added.
      </p>
    );
  }
  if (item.status === "error") {
    return (
      <p role="alert" className="mt-3 text-[13.5px] font-semibold text-danger">
        {errorCopy(item)}
      </p>
    );
  }
  return (
    <p role="status" className="mt-3 text-[13.5px] text-ink-soft">
      <em className="not-italic font-semibold">
        {item.title ?? item.filename}
      </em>{" "}
      joined the shelf — it will appear queued below.
    </p>
  );
}

export function UploadOutcome({ summary, error }: UploadOutcomeProps) {
  if (error) {
    return (
      <p role="alert" className="mt-3 text-[13.5px] font-semibold text-danger">
        {isIndeterminateFailure(error) ? INDETERMINATE_COPY : error.message}
      </p>
    );
  }
  if (!summary || summary.items.length === 0) {
    return null;
  }
  if (summary.items.length === 1) {
    return <SingleOutcome item={summary.items[0]} />;
  }

  /* Index-qualified key: one drop may legitimately contain two files of the
     same name (the cohort classifier is built for exactly that), and if both
     fail the bare filename collides. Position is stable — items follow the
     input order and the list never reorders. */
  const failed = summary.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status === "error");
  return (
    <div className="mt-3 text-[13.5px]">
      <p role="status" className="text-ink-soft">
        {summary.created} added · {summary.duplicates} already on the shelf ·{" "}
        {summary.errors} failed
      </p>
      {failed.length > 0 && (
        <ul role="alert" className="mt-1 list-none">
          {failed.map(({ item, index }) => (
            <li
              key={`${index}-${item.filename}`}
              className="font-semibold text-danger"
            >
              {item.filename} — {errorCopy(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
