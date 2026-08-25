import {
  classifyFailure,
  isUnconfirmedFailure,
  type UploadOutcomeItem,
  type UploadSummary,
} from "../../api";

/* Inline results under the dropzone — a deliberate design extension: the
   mockup has no results area, so tone rules come from the plan. Duplicates are
   NEVER an error: calm role="status" text. Neither is an upload we cannot
   prove failed. role="alert" and danger styling are reserved for a positively
   identified refusal. */

export interface UploadOutcomeProps {
  summary: UploadSummary | null;
  /** Mutation-level rejection (batch 500 etc.) — no per-file items exist. */
  error: Error | null;
}

/* A lost response is not a refusal: the book may already be on the shelf
   (which the mutation re-fetches on exactly this outcome), so the copy must
   not claim it failed outright. */
const INDETERMINATE_COPY =
  "The shelf never answered — if the book was added it will appear below.";

/*
 * The sequential path carries the ApiError code and so can key on it. The
 * batch path carries only the backend's message string — rendered verbatim,
 * because PLAN.md rules out reverse-mapping message text to codes (it would
 * break on any backend copy edit). That string stays even for an `opaque`
 * item: "Failed to commit the uploaded document." is more use to the reader
 * than a generic hedge, and the count beside it already says unconfirmed.
 */
function errorCopy(item: UploadOutcomeItem): string {
  if (item.code === "unsupported_file_type") {
    return "Only PDFs can join the shelf";
  }
  if (item.certainty === "unproven") {
    return INDETERMINATE_COPY;
  }
  return item.error ?? "The upload failed.";
}

function CalmLine({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mt-3 text-[14px] text-fg-muted">
      {children}
    </p>
  );
}

function SingleOutcome({ item }: { item: UploadOutcomeItem }) {
  if (item.status === "duplicate") {
    return (
      <CalmLine>
        <em className="not-italic font-semibold">
          {item.title ?? item.filename}
        </em>{" "}
        is already on the shelf — nothing was added.
      </CalmLine>
    );
  }
  if (item.status === "error") {
    /* Unconfirmed is not failed: the shelf is being re-read as this renders,
       so shouting in danger red would contradict a row that may appear. */
    return isUnconfirmedFailure(item) ? (
      <CalmLine>{errorCopy(item)}</CalmLine>
    ) : (
      <p role="alert" className="mt-3 text-[14px] font-semibold text-danger">
        {errorCopy(item)}
      </p>
    );
  }
  return (
    <CalmLine>
      <em className="not-italic font-semibold">
        {item.title ?? item.filename}
      </em>{" "}
      joined the shelf — it will appear queued below.
    </CalmLine>
  );
}

export function UploadOutcome({ summary, error }: UploadOutcomeProps) {
  if (error) {
    const refused = classifyFailure(error) === "refused";
    return refused ? (
      <p role="alert" className="mt-3 text-[14px] font-semibold text-danger">
        {error.message}
      </p>
    ) : (
      <CalmLine>{INDETERMINATE_COPY}</CalmLine>
    );
  }
  if (!summary || summary.items.length === 0) {
    return null;
  }
  if (summary.items.length === 1) {
    return <SingleOutcome item={summary.items[0]} />;
  }

  /* Index-qualified keys: one drop may legitimately contain two files of the
     same name (the cohort classifier is built for exactly that), and if both
     fail the bare filename collides. Position is stable — items follow the
     input order and the list never reorders. */
  const errored = summary.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status === "error");
  /* "Failed" means the server positively refused the file. Everything else it
     could not answer for — a lost response (`unproven`) or a batch item whose
     wire shape carries no code at all (`opaque`, and the backend's own commit
     path is documented as commit-ambiguous) — is reported as unconfirmed.
     Counting those as failed would contradict the shelf refresh happening
     underneath and invite a pointless retry (review #6, #8). */
  const unconfirmed = errored.filter(({ item }) => isUnconfirmedFailure(item));
  const refused = errored.filter(({ item }) => !isUnconfirmedFailure(item));
  return (
    <div className="mt-3 text-[14px]">
      <p role="status" className="text-fg-muted">
        {summary.created} added · {summary.duplicates} already on the shelf ·{" "}
        {refused.length} failed
        {unconfirmed.length > 0 && ` · ${unconfirmed.length} unconfirmed`}
      </p>
      {refused.length > 0 && (
        <ul role="alert" className="mt-1 list-none">
          {refused.map(({ item, index }) => (
            <li
              key={`${index}-${item.filename}`}
              className="font-semibold text-danger"
            >
              {item.filename} — {errorCopy(item)}
            </li>
          ))}
        </ul>
      )}
      {unconfirmed.length > 0 && (
        <ul className="mt-1 list-none text-fg-muted">
          {unconfirmed.map(({ item, index }) => (
            <li key={`${index}-${item.filename}`}>
              {item.filename} — {errorCopy(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
