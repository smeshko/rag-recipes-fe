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
    <Pill size="md" tone="working" className="gap-2">
      <span>filtering: {title}</span>
      <button
        type="button"
        aria-label="Clear the book filter"
        onClick={onClear}
        className="text-[15px] leading-none transition-opacity hover:opacity-60"
      >
        ×
      </button>
    </Pill>
  );
}
