import { useRef } from "react";
import { useParams } from "react-router";
import { ApiError, useKnowledgeItem } from "../../../api";
import { RecipeError, RecipeNotARecipe, RecipeNotFound } from "../RecipeStates";
import { NotEditable } from "./EditStates";
import { isEditableStatus } from "./editableStatus";
import { RecipeEditForm } from "./RecipeEditForm";

/* RecipePage's TitleSkeleton shape, re-pitched for the edit head (eyebrow +
   pill, then the title). Its own testid so a test can tell the two pages
   apart while both are mounted-by-route in the same suite. */
function EditSkeleton() {
  return (
    <div aria-hidden="true" data-testid="edit-skeleton" className="pt-10">
      <div className="flex gap-2">
        <div className="h-[29px] w-24 animate-pulse rounded-pill bg-skeleton/60" />
        <div className="h-[29px] w-28 animate-pulse rounded-pill bg-skeleton/40" />
      </div>
      {/* h-8 tracks the real head: the h1 is 26px at 1.2 leading (~31px), so a
          40px block would settle into a visibly shorter title. */}
      <div className="mt-5 h-8 w-2/3 animate-pulse rounded bg-skeleton/60" />
      <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-skeleton/40" />
    </div>
  );
}

/* A two-line local copy of RecipePage's predicate, deliberately not an export
   added to a read-mode file (D2): present and not recipe.v* means wrong-shape;
   a missing/blank schema still renders optimistically. */
function isRecipeShaped(schema: string | undefined): boolean {
  return !schema || /^recipe\.v/.test(schema);
}

/**
 * `/recipes/:id/edit` — the pre-form ladder, and nothing else.
 *
 * The order is shape before status (D2): the shape gate answers "can this form
 * represent the item at all", which is the more informative dead end for a
 * `technique.v1` item; the status gate answers "may it be edited".
 *
 * Every rung is an early return and **this component calls no form hook**
 * (D22). `useEditForm` / `useBlocker` / `useBeforeUnload` all need a
 * `KnowledgeItemResponse` that only exists on the last rung, so calling them
 * here would be conditional hook calls and React would throw the moment an
 * item 404'd. They live in `RecipeEditForm` instead.
 */
export function RecipeEditPage() {
  const { id } = useParams();
  const item = useKnowledgeItem(id);
  /* What the mounted form last reported about itself. The status gate below is
     re-evaluated on every cache update, and `useKnowledgeItem` has no
     `staleTime` and leaves `refetchOnReconnect` at its default — so a reconnect
     or an invalidation can hand this page an item another tab has since
     approved. Swapping the form out for `NotEditable` at that moment would
     throw away the reviewer's unsaved work in silence: `useBlocker` and
     `beforeunload` only see navigation and unload, never an unmount (review
     #1.2). */
  const draftRef = useRef({ id: "", dirty: false });

  /* Hoisted above every rung, because two of them can fire on a *background*
     result rather than the first load: the error rung when a refetch fails
     while the cached item is still perfectly good, and the status rung above.
     Matching on either the route param or the cached item's own id keeps the
     latch from surviving into a different recipe's session. */
  const draftHeld =
    draftRef.current.dirty &&
    (draftRef.current.id === id ||
      draftRef.current.id === item.data?.knowledge_item.id);

  if (item.isLoading) {
    return <EditSkeleton />;
  }

  /* `!draftHeld`: with data already in hand, an errored query means a refetch
     failed, not that the item is gone — TanStack keeps the last good `data`
     alongside the error. Tearing the form down for a transient blip loses the
     draft exactly as the status flip would (review #2.1). */
  if (item.isError && !(draftHeld && item.data)) {
    const err = item.error;
    /* The cast is required and is what RecipePage:43 does: `item.error` is
       typed `Error`, the prop is `ApiError`. */
    return err instanceof ApiError &&
      err.code === "knowledge_item_not_found" ? (
      <RecipeNotFound id={id} />
    ) : (
      <RecipeError error={err as ApiError} onRetry={() => item.refetch()} />
    );
  }

  /* Explicit, not a fallthrough: with no `:id` the query is disabled, so there
     is nothing to render a form against. `item.data` rather than
     `item.isSuccess`, because the held-draft path above arrives here with the
     last good payload and a query whose status is `error`. */
  const data = item.data;
  if (!data) {
    return null;
  }

  if (!isRecipeShaped(data.knowledge_item.structured_data.schema)) {
    return <RecipeNotARecipe title={data.display.title} />;
  }

  /* `status` is a plain string on the item type — a string compare, not a
     narrowed union. A CLEAN session still yields to the dead end, which is the
     honest and more useful answer; only an open draft holds the form. */
  if (!isEditableStatus(data.knowledge_item.status) && !draftHeld) {
    return <NotEditable status={data.knowledge_item.status} id={id} />;
  }

  /* The held draft is where the conflict becomes visible, so it is where the
     page says so: a form that stays mounted over an item somebody else has
     decided must not do it silently. `SaveConflict` renders this proactively,
     and the same component renders the backend's coded refusal if the
     reviewer saves anyway — both triggers, one voice (D11). */
  return (
    <RecipeEditForm
      item={data}
      draftRef={draftRef}
      /* Same predicate as the gate above, and that is the point (see
         editableStatus.ts): `ready` is now an ordinary thing to be editing,
         so it must not raise the "someone beat you to it" banner. What still
         does: `indexing`, `rejected`, `superseded` — all of which mean
         somebody or something acted on this item while the form was open. */
      conflictStatus={
        isEditableStatus(data.knowledge_item.status)
          ? undefined
          : data.knowledge_item.status
      }
    />
  );
}
