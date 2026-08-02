import { useDocument } from "../../api";
import { Pill } from "../../ui";

/* The active-filter token (TASK-003). Reads the book's title from the shared
   ['document', id] detail cache — warm from the library, and NEVER from the
   review items, because an empty filtered list has no items to read a title
   from. Pending degrades to an ellipsis, error to "this book"; the clear
   button works regardless. Visual: the `working` accent-fill surface so it
   reads as an active filter, not a status. */

export function FilterChip({
  documentId,
  onClear,
}: {
  documentId: string;
  onClear: () => void;
}) {
  const detail = useDocument(documentId);
  const title = detail.isSuccess
    ? detail.data.document.title
    : detail.isError
      ? "this book"
      : "…";

  return (
    /* Pill is inline-flex and does not wrap internally, so a long book title
       pushes the chip past the viewport. This is the plan's ONE sanctioned
       truncation (PLAN.md's no-clipping rule names it explicitly) and it is
       only allowed because the full title stays reachable in the title
       attribute — the visible text is shortened, the accessible text is not. */
    <Pill size="md" tone="working" className="max-w-full gap-2">
      <span className="truncate" title={title}>
        filtering: {title}
      </span>
      <button
        type="button"
        aria-label="Clear the book filter"
        onClick={onClear}
        className="grid place-items-center text-[15px] leading-none transition-opacity hover:opacity-60 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      >
        ×
      </button>
    </Pill>
  );
}
