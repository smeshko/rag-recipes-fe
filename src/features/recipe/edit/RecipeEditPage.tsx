import { useParams } from "react-router";
import { ApiError, useKnowledgeItem } from "../../../api";
import { RecipeError, RecipeNotARecipe, RecipeNotFound } from "../RecipeStates";
import { NotEditable } from "./EditStates";
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
      <div className="mt-5 h-10 w-2/3 animate-pulse rounded bg-skeleton/60" />
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

  if (item.isLoading) {
    return <EditSkeleton />;
  }

  if (item.isError) {
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

  /* Explicit, not a fallthrough: with no `:id` the query is disabled, so it is
     neither loading nor errored nor successful. The route always supplies one,
     but LibraryPage's discipline is to name the branch rather than let a bare
     `else` render a form against `undefined`. */
  if (!item.isSuccess) {
    return null;
  }

  const data = item.data;

  if (!isRecipeShaped(data.knowledge_item.structured_data.schema)) {
    return <RecipeNotARecipe title={data.display.title} />;
  }

  /* `status` is a plain string on the item type — a string compare, not a
     narrowed union. */
  if (data.knowledge_item.status !== "needs_review") {
    return <NotEditable status={data.knowledge_item.status} id={id} />;
  }

  return <RecipeEditForm item={data} />;
}
