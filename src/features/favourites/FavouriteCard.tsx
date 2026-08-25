import { Link, useLocation } from "react-router";
import type { KnowledgeItemSummary } from "../../api";
import { Pill, withReturnTo } from "../../ui";
import { relativeTime } from "../library/relativeTime";
import { statusTone } from "../recipe/statusTone";
import { FavouriteButton } from "./FavouriteButton";

/* One saved recipe on /favourites.

   `RecipeRow` without the book's verbs: edit and delete belong to a book's
   contents, where a reader is curating a shelf. Here they would be a trapdoor
   — the list exists to cook from, and its only verb is the star that takes a
   row back off it.

   The status pill renders only when the status is worth saying. A book's
   contents leads with status because most of that screen is provenance; here
   a shelved recipe is the norm and a pill on every row would be noise. What
   IS worth saying is the exception: a favourite whose book has been
   reprocessed sits on a `superseded` row (the backend keeps showing it rather
   than letting it vanish — see the favourites route docstring), and a reader
   who clicks through to a dead generation deserves to have been warned. */

const QUIET_STATUSES = new Set(["ready"]);

/** `p. {start}` for a one-page span, `pp. {start}–{end}` otherwise; a null
    start (the locator never resolved) → no span at all. `RecipeRow`'s rule. */
function pageSpan({
  page_start,
  page_end,
}: KnowledgeItemSummary["source_pages"]): string | null {
  if (page_start === null) return null;
  if (page_end === null || page_end === page_start) return `p. ${page_start}`;
  return `pp. ${page_start}–${page_end}`;
}

export function FavouriteCard({ item }: { item: KnowledgeItemSummary }) {
  const location = useLocation();
  const span = pageSpan(item.source_pages);
  const status = statusTone(item.status);

  return (
    <article className="rounded-[18px] border border-border bg-surface-raised px-6 py-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[20px] font-semibold leading-[1.25]">
            {item.title}
          </h3>
          {/* The book is the headline provenance here, not the page: this list
              is cross-shelf, so "which book is this from" is the question a
              row actually raises. */}
          <small className="mt-1 block text-[12.5px] font-semibold text-fg-subtle">
            {item.document.title}
            {span ? ` · ${span}` : ""}
            {item.favourited_at ? (
              <>
                {" · "}
                <time dateTime={item.favourited_at}>
                  saved {relativeTime(item.favourited_at)}
                </time>
              </>
            ) : null}
          </small>
        </div>
        <div className="flex items-center gap-2">
          {!QUIET_STATUSES.has(item.status) && (
            <Pill size="md" tone={status.tone}>
              {status.label}
            </Pill>
          )}
          <FavouriteButton
            itemId={item.id}
            favourited={Boolean(item.favourited_at)}
            title={item.title}
          />
        </div>
      </div>

      {item.summary && (
        <p className="mt-2 text-[13.5px] text-fg-muted">{item.summary}</p>
      )}

      <div className="mt-4">
        <Link
          to={withReturnTo(`/recipes/${item.id}`, location)}
          className="text-[12.5px] font-bold text-accent hover:underline inline-flex items-center pointer-coarse:min-h-11"
        >
          View recipe →
        </Link>
      </div>
    </article>
  );
}
