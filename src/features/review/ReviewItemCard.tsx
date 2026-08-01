import { Link } from "react-router";
import type { ReviewFlag, ReviewItem } from "../../api";

/* The flagged-item card (phase 4.3, TASK-002). A vertical-list composition of
   primitives — NOT `Card`, which is the 3-col grid shape — on the BookRow
   surface, minus the hover lift: the card itself is not clickable, only its
   link (and TASK-004's action buttons) are.

   Flags come FIRST and every one renders. Messages are sentence-length
   backend-authored copy rendered verbatim — a line, not a `Pill` (Pill is
   non-wrapping inline-flex and cannot hold sentences). The FE keeps no
   code→copy table: `code` is an opaque backend enum used only as a stable
   key, and the only fallback for an empty `message` is the raw code string. */

const flagText = (flag: ReviewFlag) => flag.message || flag.code;

/** `source_pages` is structured, so format inline (task note): `p. {start}`
    for a one-page span, `pp. {start}–{end}` otherwise; null start (the
    locator never resolved) → no span at all. */
const pageSpan = ({
  page_start,
  page_end,
}: ReviewItem["source_pages"]): string | null => {
  if (page_start === null) return null;
  if (page_end === null || page_end === page_start) return `p. ${page_start}`;
  return `pp. ${page_start}–${page_end}`;
};

export function ReviewItemCard({ item }: { item: ReviewItem }) {
  /* `flags` is non-empty by contract — an unflagged item is not in the queue. */
  const [lead, ...secondaries] = item.flags;
  const span = pageSpan(item.source_pages);

  return (
    <article className="rounded-[18px] border border-line bg-card px-6 py-5 shadow-card">
      <p
        data-testid="review-flag-lead"
        className="text-[13px] font-semibold text-danger"
      >
        {flagText(lead)}
      </p>
      {secondaries.map((flag) => (
        <p
          key={flag.code}
          data-testid="review-flag-secondary"
          className="mt-1 text-[12px] font-semibold text-danger/80"
        >
          {flagText(flag)}
        </p>
      ))}

      <h3 className="mt-2 font-display text-[20px] font-semibold leading-[1.25]">
        {item.title}
      </h3>
      <small className="mt-1 block text-[12.5px] font-semibold text-ink-faint">
        {span ? `${item.document.title} · ${span}` : item.document.title}
      </small>
      {item.summary && (
        <p
          data-testid="review-item-summary"
          className="mt-2 text-[13.5px] text-ink-soft"
        >
          {item.summary}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-4">
        <Link
          to={`/recipes/${item.id}`}
          className="text-[12.5px] font-bold text-apricot hover:underline"
        >
          View recipe →
        </Link>
        {/* Actions slot — TASK-004 fills it with approve/reject. */}
      </div>
    </article>
  );
}
