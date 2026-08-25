import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import {
  type ApiError,
  useDocument,
  useDocumentKnowledgeItems,
} from "../../api";
import { BackLink, Bloom, Pill, readReturnTo } from "../../ui";
import {
  BookEmptyAll,
  BookEmptyFiltered,
  BookError,
  BookNotFound,
  BookSkeleton,
} from "./BookStates";
import { RecipeRow } from "./RecipeRow";

/* One book's contents: every recipe it produced, at every status, with an
   edit and a delete per row. The screen the shelf never had — /library shows
   only counts, and /review shows only what is still flagged, so an approved
   book was previously reachable one recipe at a time through search.

   The <Bloom> wrappers are inert — `.bloom` is a no-op class and nothing here
   animates in. They remain as the layout divs their className props make them,
   and go when Bloom itself is retired.

   ?status=<status> narrows the list. The URL is the single source of truth
   (SearchPage's pattern, restated on ReviewPage): the value is derived every
   render, never mirrored into local state, and the chip is derived UI on top
   of it. */

/** The statuses worth offering as filters, in the order a reader thinks about
    them. `superseded` and `rejected` are reachable by hand-typing `?status=`
    (the backend serves them) but are deliberately not chips: they are dead
    generations, not part of the book as it stands. */
const STATUS_FILTERS = [
  { value: "ready", label: "Ready" },
  { value: "needs_review", label: "Needs review" },
] as const;

const labelFor = (status: string) =>
  STATUS_FILTERS.find((f) => f.value === status)?.label ?? status;

export function BookPage() {
  const { documentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  /* `||`, not `??`: a hand-typed `?status=` (empty string) must mean "no
     filter" end-to-end — otherwise the UI goes unfiltered while the request
     still carries a literal `status=` and the cache mints a phantom
     ['knowledge-items', id, ''] entry. ReviewPage's rule, same trap. */
  const status = searchParams.get("status") || undefined;

  const book = useDocument(documentId);
  const items = useDocumentKnowledgeItems(documentId, status);
  const recipes = items.data?.knowledge_items ?? [];

  const returnTarget = readReturnTo(searchParams);

  /* Delete failures, keyed by item id. A failed delete optimistically
     UNMOUNTS the card and rolls it back, so the message must outlive the
     card's own state to survive the rollback re-render — it lives here and
     travels down as props. (ReviewPage learned this the same way.) */
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const recordDeleteError = (itemId: string, message: string | null) => {
    setDeleteErrors((previous) => {
      if (message === null) {
        if (!(itemId in previous)) return previous;
        const next = { ...previous };
        delete next[itemId];
        return next;
      }
      return { ...previous, [itemId]: message };
    });
  };

  /* Functional updater so unknown params — `?from=` above all — survive the
     write. SearchPage's `writeParams` discipline. */
  const setStatus = (next: string | undefined) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === undefined) {
        params.delete("status");
      } else {
        params.set("status", next);
      }
      return params;
    });
  };

  /* A 404 on the book is not an outage — it is a stale link, and it has its
     own arm. Everything else falls through to the error box. */
  const bookError = book.error as ApiError | null;
  if (bookError?.code === "document_not_found") {
    return (
      <div className="pt-10">
        <BookNotFound />
      </div>
    );
  }

  const title = book.isSuccess ? book.data.document.title : "…";
  /* LibraryPage's statsLine discipline: an em-dash placeholder until the list
     settles successfully — an outage is not an empty book. */
  const countLine = items.isSuccess
    ? `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}${
        status ? ` · filtered to ${labelFor(status).toLowerCase()}` : ""
      }`
    : "— recipes";

  return (
    <div>
      {returnTarget !== null && (
        <Bloom duration={0.7} delay={0.04} className="pt-8">
          <BackLink />
        </Bloom>
      )}
      {/* The back link takes the head's top padding over, so total top
          spacing stays 40px either way — padding moved between two stacked
          elements, not a restyle. ReviewPage does the same. */}
      <Bloom
        duration={0.7}
        delay={0.06}
        className={`${returnTarget === null ? "pt-10" : "pt-2"} pb-2`}
      >
        {/* LibraryPage's page-title size, fixed rather than clamped: the book
            title is chrome, and chrome does not scale with the viewport. */}
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          {title}
        </h1>
        <div className="mt-2 text-[15px] text-fg-muted">{countLine}</div>
      </Bloom>

      <Bloom duration={0.7} delay={0.1} className="mt-4 flex flex-wrap gap-2">
        {/* ModeChips' shape: ghost chips with one near-black solid marking the
            selection. Selection used to be an accent tint, which on this screen
            put a blue-on-blue chip directly above a row of tinted status pills
            and read as one more status rather than as the active filter. */}
        <button
          type="button"
          aria-pressed={status === undefined}
          onClick={() => setStatus(undefined)}
          className={`rounded-pill border px-4 py-[7px] text-[13px] font-medium pointer-coarse:min-h-11 transition-colors ${
            status === undefined
              ? "border-transparent bg-surface-inverted text-fg-inverted"
              : "border-border bg-transparent text-fg-muted hover:bg-surface-hover hover:text-fg"
          }`}
        >
          All
        </button>
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={status === filter.value}
            onClick={() => setStatus(filter.value)}
            className={`rounded-pill border px-4 py-[7px] text-[13px] font-medium pointer-coarse:min-h-11 transition-colors ${
              status === filter.value
                ? "border-transparent bg-surface-inverted text-fg-inverted"
                : "border-border bg-transparent text-fg-muted hover:bg-surface-hover hover:text-fg"
            }`}
          >
            {filter.label}
          </button>
        ))}
        {/* A hand-typed status outside the chip set still reads back as an
            active filter rather than silently showing "All". */}
        {status !== undefined &&
          !STATUS_FILTERS.some((f) => f.value === status) && (
            <Pill size="md" tone="working">
              {status}
            </Pill>
          )}
      </Bloom>

      <div className="mt-9">
        {items.isPending && <BookSkeleton />}

        {items.isError && (
          <BookError
            error={items.error as ApiError}
            onRetry={() => items.refetch()}
          />
        )}

        {items.isSuccess &&
          recipes.length === 0 &&
          (status ? (
            <BookEmptyFiltered
              label={labelFor(status)}
              onClear={() => setStatus(undefined)}
            />
          ) : (
            <BookEmptyAll />
          ))}

        {recipes.map((item, index) => (
          <Bloom
            key={item.id}
            index={index}
            base={0.18}
            step={0.04}
            className="mb-4"
          >
            <RecipeRow
              item={item}
              deleteError={deleteErrors[item.id]}
              onDeleteError={recordDeleteError}
            />
          </Bloom>
        ))}
      </div>
    </div>
  );
}
