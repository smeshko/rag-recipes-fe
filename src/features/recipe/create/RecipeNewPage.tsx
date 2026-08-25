import { useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useCreateKnowledgeItem } from "../../../api";
import {
  BackLink,
  Bloom,
  Eyebrow,
  readReturnTo,
  withReturnTo,
} from "../../../ui";
import { FactsFields } from "../edit/FactsFields";
import { IngredientsEditPanel } from "../edit/IngredientsEditPanel";
import { MethodEditPanel } from "../edit/MethodEditPanel";
import { TitleFields } from "../edit/TitleFields";
import { UnsavedGuard } from "../edit/UnsavedGuard";
import { useNewRecipeForm } from "./useNewRecipeForm";

/* The field components come from `edit/` rather than from a `create/` copy of
   them, and the direction of that import is deliberate: the edit surface is
   where they were designed, and a recipe you can write must look exactly like
   a recipe you can correct. Nothing in them is edit-specific — they bind a
   form shape and render the read page's chrome in typeable form. Moving them
   up to a shared folder would be a pure file move; it is not done here only
   because it would churn the edit tests that address them by path. */

/**
 * `/recipes/new` — write a recipe by hand.
 *
 * No pre-form ladder, unlike `RecipeEditPage`: there is no item to load, so
 * there is nothing that can 404, be the wrong shape, or have been decided by
 * somebody else while the form was open. That is the whole reason this is a
 * page rather than a mode on the edit page — every one of that page's four
 * early returns, and the held-draft latch that guards them, exists to answer a
 * question a blank form does not raise.
 *
 * The backend puts it on the shared "Handwritten" book (creating it on the
 * first save) and returns it already `indexing`, so the recipe reaches the
 * shelf before it reaches search. The notice below says so, for the same
 * reason the edit form's re-index notice does: better read it here than
 * discover it by failing to find the recipe afterwards.
 */
export function RecipeNewPage() {
  const { form, setField, setRows, newRow, isDirty, isValid, createBody } =
    useNewRecipeForm();
  const create = useCreateKnowledgeItem();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  /* The discard latch, exactly as `RecipeEditForm` uses it: raised by Cancel
     and by a save that landed, read by `UnsavedGuard`'s blocker. A ref, not
     state, because it has to be readable in the same tick it is written —
     there is no re-render between the two lines of either handler. */
  const discardingRef = useRef(false);

  /* Where Cancel goes, and the target a saved recipe's own back link inherits.
     `/library` rather than `/` when there is no `?from=`: the shelf is where
     the entry point lives and where the new recipe will appear. */
  const target = readReturnTo(searchParams);
  const cancelHref = target?.to ?? "/library";

  const onCancel = () => {
    discardingRef.current = true;
    navigate(cancelHref);
  };

  const submit = () => {
    create.mutate(createBody(), {
      /* A PER-CALL callback, not the hook-level seam `RecipeEditForm` uses,
         and that difference is what makes this unmount-safe for free:
         query-core skips per-call callbacks once the observer has no listeners
         (`MutationObserver#notify`), so an author who navigates away
         mid-request is not yanked back here when the 201 lands. The cache
         writes that must happen either way are on the hook itself. */
      onSuccess: (data) => {
        /* Mandatory, not defensive: nothing about a successful save makes the
           form clean — it still holds everything that was typed — so without
           this the guard would ask to discard the recipe we just created. */
        discardingRef.current = true;
        const href = `/recipes/${data.knowledge_item.id}`;
        navigate(
          target
            ? withReturnTo(href, { pathname: target.to, search: "" })
            : href,
        );
      },
    });
  };

  return (
    <div data-testid="recipe-new-page">
      <UnsavedGuard isDirty={isDirty} discardingRef={discardingRef} />
      <Bloom duration={0.7} delay={0.04} className="pt-8">
        <BackLink />
      </Bloom>
      <Bloom duration={0.7} delay={0.08} className="pt-2 pb-2">
        {/* Names the shelf it will land on, so "where did it go?" is answered
            before it is asked. */}
        <Eyebrow>Handwritten</Eyebrow>
        <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.02em]">
          Write one down.
        </h1>
        {create.isError && (
          <p
            data-testid="create-failed"
            role="alert"
            className="mt-4 rounded-reco border border-danger-border bg-danger-fill px-5 py-3 text-[13px] font-medium text-danger"
          >
            {/* The backend's own sentence, verbatim — the house rule. There is
                no code table here because there is no guard stack to name: a
                create has no other author to lose to and no book to be
                mid-reprocess. */}
            {create.error instanceof Error
              ? create.error.message
              : "The recipe could not be saved."}
          </p>
        )}
        {/* A neutral inset fill, matching the edit form's re-index notice: on
            this page the only other filled box is the danger-toned create
            failure, and a second tint beside it made an ordinary heads-up read
            as a second thing that had gone wrong. */}
        <p className="mt-4 rounded-reco border border-border bg-surface-inset px-5 py-3 text-[13px] text-fg-muted">
          It joins the Handwritten book on your shelf straight away, then takes
          a moment to be indexed before it turns up in search.
        </p>
        <TitleFields form={form} isValid={isValid} setField={setField} />
        <FactsFields form={form} setField={setField} />
      </Bloom>
      {/* One full-width column, matching the edit form (its D11): a 1fr column
          of textareas is exactly the cramping that layout exists to avoid. */}
      <div className="mt-8 flex flex-col gap-[26px]">
        <Bloom duration={0.7} delay={0.14}>
          <IngredientsEditPanel
            rows={form.ingredients}
            onChange={(rows) => setRows("ingredients", rows)}
            newRow={() => newRow("ingredients")}
          />
        </Bloom>
        <Bloom duration={0.7} delay={0.18}>
          <MethodEditPanel
            rows={form.steps}
            onChange={(rows) => setRows("steps", rows)}
            newRow={() => newRow("steps")}
          />
        </Bloom>
      </div>
      <Bloom
        duration={0.7}
        delay={0.22}
        className="mt-8 flex flex-wrap items-center gap-3"
      >
        <button
          type="button"
          onClick={onCancel}
          className="rounded-pill border border-border px-5 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg pointer-coarse:min-h-11"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="create-save"
          onClick={submit}
          /* Untitled is the only thing that cannot be saved. Everything else —
             no ingredients, no method — the backend accepts, because `PATCH`
             accepts emptying both and a stricter rule on the way in would just
             be a trap. */
          disabled={!isValid || create.isPending}
          /* The primary solid, same token and same opacity hover as the edit
             form's Save — the two surfaces are one form wearing two verbs. */
          className="rounded-pill bg-surface-inverted px-5 py-2 text-[13px] font-medium text-fg-inverted transition-opacity hover:opacity-80 disabled:opacity-40 pointer-coarse:min-h-11"
        >
          {create.isPending ? "Saving…" : "Save recipe"}
        </button>
      </Bloom>
    </div>
  );
}
