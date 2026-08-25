import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { type KnowledgeItemResponse, useDeleteKnowledgeItem } from "../../api";
import { readReturnTo, withReturnTo } from "../../ui";
import { FavouriteButton } from "../favourites/FavouriteButton";
import { isEditableStatus } from "./edit/editableStatus";

/* The read page's own action row: Edit and Delete, on every recipe, however
   the reader got here.

   Before this the only edit affordance on this page lived inside
   `ReviewCallout`, which renders for `needs_review` items alone — so a shelved
   recipe reached from search had no way out but to retype its URL, and no way
   to be removed at all. The callout keeps its job (what is still flagged, and
   whether someone has corrected it); the verbs moved here, once, so a reader
   does not meet two different Edit buttons on one page.

   THE EDIT LINK forwards the recipe's own VALIDATED return target rather than
   the recipe's URL — `ReviewCallout`'s rule, kept verbatim because the trap is
   unchanged. Capturing `/recipes/:id` would pass `readReturnTo` and then
   classify as `null` in `returnSection`, so the editor's back link would fall
   through to its fourth arm and drop the reader on search instead of where
   they actually came from. This is `RecipeEditForm`'s `readHref` idiom run in
   the opposite direction.

   DELETE navigates, because it has to: the row is gone, and this page is a
   404 the moment the request succeeds. It lands on the validated return target
   when there is one — the book's contents, the queue, the search that found
   it — and on the library otherwise, which is the only honest guess. */

export function RecipeActions({ item }: { item: KnowledgeItemResponse }) {
  const {
    id,
    document_id: documentId,
    status,
    favourited_at: favouritedAt,
  } = item.knowledge_item;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const target = readReturnTo(searchParams);
  const editHref = target
    ? withReturnTo(`/recipes/${id}/edit`, { pathname: target.to, search: "" })
    : `/recipes/${id}/edit`;

  const remove = useDeleteKnowledgeItem(id, documentId, {
    /* No optimistic anything: there is no list here to remove a card from, and
       the hook's own composed settle already invalidates every cache the
       delete touches. The page simply leaves. */
    onSettled: (error) => {
      if (error === null) {
        navigate(target?.to ?? "/library", { replace: true });
      }
    },
  });

  return (
    <div
      data-testid="recipe-actions"
      className="mt-6 flex flex-wrap items-center gap-3 max-[560px]:flex-col max-[560px]:items-stretch"
    >
      {confirmingDelete ? (
        <>
          {/* A full sentence, so on a phone it takes its own line above the
              buttons rather than competing with them for 335px. "Keep" stays
              last, which in a column puts the safe choice nearest the thumb. */}
          <p className="text-[13px] font-medium text-danger">
            Deleting is permanent — recovery is reprocessing the whole book.
          </p>
          {/* The one solid fill left on this row, and it is danger rather than
              the black primary: the confirm step is the only place on the read
              page where colour is carrying the meaning. */}
          <button
            type="button"
            data-testid="recipe-delete-confirm"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
            className="rounded-pill bg-danger px-5 py-2 text-[13px] font-medium pointer-coarse:min-h-11 text-fg-on-accent transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {remove.isPending ? "Deleting…" : "Delete recipe"}
          </button>
          {/* Ghost, and deliberately the quietest control in the row: hovering
              the safe choice fills it grey rather than tinting it accent-blue,
              which read as the recommended action sitting next to a red one. */}
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => setConfirmingDelete(false)}
            className="rounded-pill border border-border bg-transparent px-5 py-2 text-[13px] font-medium pointer-coarse:min-h-11 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
          >
            Keep
          </button>
        </>
      ) : (
        <>
          {/* The star leads the row: it is the only verb here a reader uses
              repeatedly, and the only one that is not destructive or an
              edit. It renders at every status — a superseded recipe is still
              worth keeping, and unstarring one is how it leaves the list. */}
          <FavouriteButton
            itemId={id}
            favourited={Boolean(favouritedAt)}
            size="md"
            title={item.display.title}
          />
          {/* A <Link>, not a <button>: it navigates, so middle-click, ⌘-click
              and the page's own focus ring all keep working. Hidden — not
              disabled — where an edit cannot succeed: `indexing` is mid-flight
              and the backend 409s, `superseded` / `rejected` are dead
              generations, and the editor would refuse all three anyway. */}
          {isEditableStatus(status) && (
            <Link
              to={editHref}
              data-testid="recipe-edit-link"
              /* The near-black solid — the page's one primary action. Hover
                 lightens by opacity rather than by a darker fill because the
                 same token is near-white in dark mode, where a "darker" hover
                 would move the wrong way. */
              className="inline-flex items-center rounded-pill bg-surface-inverted px-5 py-2 text-[13px] font-medium pointer-coarse:min-h-11 text-fg-inverted transition-opacity hover:opacity-80"
            >
              Edit this recipe
            </Link>
          )}
          <button
            type="button"
            data-testid="recipe-delete"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-pill border border-danger-border bg-transparent px-5 py-2 text-[13px] font-medium pointer-coarse:min-h-11 text-danger transition-colors hover:bg-danger-fill"
          >
            Delete
          </button>
        </>
      )}
      {remove.isError && (
        /* The house rule: the backend's own sentence, verbatim, announced.
           The row survives a failed delete — nothing navigated. */
        <p role="alert" className="w-full text-[13px] font-medium text-danger">
          {remove.error.message}
        </p>
      )}
    </div>
  );
}
