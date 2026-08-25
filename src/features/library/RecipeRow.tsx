import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import {
  type KnowledgeItemListResponse,
  type KnowledgeItemSummary,
  useDeleteKnowledgeItem,
} from "../../api";
import { Pill, withReturnTo } from "../../ui";
import { FavouriteButton } from "../favourites/FavouriteButton";
import { statusTone } from "../recipe/statusTone";

/* One recipe in a book's contents (/library/:documentId).

   Structurally `ReviewItemCard` with the flags block traded for a status pill:
   the queue's cards are all `needs_review` and lead with what is wrong, while
   here the status IS the information — most rows are shelved and fine. Kept as
   its own component rather than a mode of the queue card because the two
   diverge on almost every line below the title, and a card that renders four
   different action sets by prop is the thing neither screen wants to debug.

   Every link OFF this card carries the page's whole URL as `?from=` (phase
   5.1's return-to contract): the `?status=` filter the reader is working
   through lives only in that URL, so a link that drops it strands them on the
   unfiltered list.

   Delete is a HARD delete — the row, its chunks and its embeddings — so it
   confirms first, in place. No modal and never `window.confirm`: the house
   pattern is the action-row swap below (`ReviewItemCard`'s `confirmingReject`),
   and `UnsavedGuard`'s D15 rules out the native dialog outright. */

/** `source_pages` is structured, so format inline: `p. {start}` for a one-page
    span, `pp. {start}–{end}` otherwise; null start (the locator never
    resolved) → no span at all. Same rule as the queue card. */
const pageSpan = ({
  page_start,
  page_end,
}: KnowledgeItemSummary["source_pages"]): string | null => {
  if (page_start === null) return null;
  if (page_end === null || page_end === page_start) return `p. ${page_start}`;
  return `pp. ${page_start}–${page_end}`;
};

/** Every ['knowledge-items', …] entry as snapshotted for rollback — the
    filtered and unfiltered lists can both hold the item. */
type ListSnapshot = [QueryKey, KnowledgeItemListResponse | undefined][];

export function RecipeRow({
  item,
  deleteError,
  onDeleteError,
}: {
  item: KnowledgeItemSummary;
  /** The page-held failure message for THIS item, if its last delete failed. */
  deleteError?: string;
  /** Record (or clear, with null) this item's failure message on the page. */
  onDeleteError: (itemId: string, message: string | null) => void;
}) {
  const status = statusTone(item.status);
  const span = pageSpan(item.source_pages);
  const location = useLocation();
  const queryClient = useQueryClient();
  /* Per-card, and correctly lost on unmount: unlike the failure message, a
     half-opened confirm has no meaning once the card is gone. */
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /* Only these two are worth an edit. `indexing` is mid-flight (the backend
     409s), and `superseded` / `rejected` are dead generations — the edit page
     would refuse them anyway, so offering the link would be a lie. */
  const editable = item.status === "ready" || item.status === "needs_review";

  const remove = useDeleteKnowledgeItem<ListSnapshot>(
    item.id,
    item.document.id,
    {
      onMutate: async () => {
        onDeleteError(item.id, null);
        /* Cancel in-flight list fetches so a late response cannot resurrect
           the row, snapshot EVERY knowledge-items entry, then filter the item
           out of each. */
        await queryClient.cancelQueries({ queryKey: ["knowledge-items"] });
        const snapshot: ListSnapshot =
          queryClient.getQueriesData<KnowledgeItemListResponse>({
            queryKey: ["knowledge-items"],
          });
        queryClient.setQueriesData<KnowledgeItemListResponse>(
          { queryKey: ["knowledge-items"] },
          (current) =>
            current && {
              knowledge_items: current.knowledge_items.filter(
                (candidate) => candidate.id !== item.id,
              ),
            },
        );
        return snapshot;
      },
      onError: (error, snapshot) => {
        /* Restore every snapshotted entry, then surface the message — the
           hook's composed settle handles the re-sync invalidations. */
        for (const [queryKey, data] of snapshot ?? []) {
          queryClient.setQueryData(queryKey, data);
        }
        onDeleteError(item.id, error.message);
      },
    },
  );

  return (
    <article className="rounded-card border border-border bg-surface-raised px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-[1.35]">
            {item.title}
          </h3>
          <small className="mt-1 block text-[13px] text-fg-subtle">
            {span ?? "page unknown"}
            {/* The edited marker rides on the provenance line at the same
                weight, not as a Pill: it is provenance — someone has already
                corrected this — not a status. The timestamp lives in
                `dateTime` and the visible text stays "Edited". */}
            {item.edited_at ? (
              <>
                {" · "}
                <time
                  data-testid="recipe-edited-marker"
                  dateTime={item.edited_at}
                >
                  Edited
                </time>
              </>
            ) : null}
          </small>
        </div>
        {/* Status then star, reading left to right as "what this row is" then
            "what I can do with it" — the same order the recipe page's head
            uses. The star sits with the status rather than in the verb row
            below because it is not one of the row's book-curation verbs; it
            is the reader keeping the recipe. */}
        <div className="flex items-center gap-2">
          <Pill size="md" tone={status.tone}>
            {status.label}
          </Pill>
          <FavouriteButton
            itemId={item.id}
            favourited={Boolean(item.favourited_at)}
            title={item.title}
          />
        </div>
      </div>

      {item.summary && (
        <p
          data-testid="recipe-row-summary"
          className="mt-2 text-[14px] text-fg-muted"
        >
          {item.summary}
        </p>
      )}

      {/* Sized for three controls; the phone tier stacks the link above them
          rather than stranding them at opposite edges of a ragged wrap. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 max-[560px]:flex-col max-[560px]:items-stretch max-[560px]:gap-3">
        <Link
          to={withReturnTo(`/recipes/${item.id}`, location)}
          className="text-[13px] font-medium text-accent hover:underline inline-flex items-center pointer-coarse:min-h-11"
        >
          View recipe →
        </Link>
        {confirmingDelete ? (
          /* The actions row swaps in place; no request has been made yet.
             The warning is a full sentence, so on a phone it takes its own
             line above the buttons. "Keep" stays last, which in a column puts
             the safe choice nearest the thumb. */
          <div className="flex flex-wrap items-center justify-end gap-3 max-[560px]:flex-col max-[560px]:items-stretch">
            <p className="text-[13px] font-medium text-danger">
              Deleting is permanent — recovery is reprocessing the whole book.
            </p>
            {/* Danger keeps its solid — it is the one place colour still
                carries meaning rather than decoration. Hover fades rather than
                darkens, matching every other solid in the app, so the same
                class works whichever way the token moves between themes. */}
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
              className="rounded-pill bg-danger px-4 py-[7px] text-[13px] font-medium pointer-coarse:min-h-11 text-fg-on-accent transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              Delete recipe
            </button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => setConfirmingDelete(false)}
              className="rounded-pill border border-border bg-transparent px-4 py-[7px] text-[13px] font-medium pointer-coarse:min-h-11 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
            >
              Keep
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 max-[560px]:justify-end">
            {/* A <Link>, not a <button>: it navigates, so middle-click,
                ⌘-click and the list's own focus ring all keep working.
                `withReturnTo(location)` means the editor's BackLink says
                "← Back to library" with no navigation code here at all. */}
            {editable && (
              <Link
                to={withReturnTo(`/recipes/${item.id}/edit`, location)}
                className="inline-flex items-center rounded-pill border border-border bg-transparent px-4 py-[7px] text-[13px] font-medium pointer-coarse:min-h-11 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
              >
                Edit
              </Link>
            )}
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-pill border border-danger-border bg-transparent px-4 py-[7px] text-[13px] font-medium pointer-coarse:min-h-11 text-danger transition-colors hover:bg-danger-fill"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {deleteError && (
        /* BookRow's error idiom — announced, danger-toned, message verbatim. */
        <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
          {deleteError}
        </p>
      )}
    </article>
  );
}
