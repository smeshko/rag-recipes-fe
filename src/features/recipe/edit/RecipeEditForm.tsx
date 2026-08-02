import { type RefObject, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  type KnowledgeItemResponse,
  useUpdateKnowledgeItem,
} from "../../../api";
import {
  BackLink,
  Bloom,
  Eyebrow,
  Pill,
  readReturnTo,
  withReturnTo,
} from "../../../ui";
import { statusTone } from "../statusTone";
import { FactsFields } from "./FactsFields";
import { IngredientsEditPanel } from "./IngredientsEditPanel";
import { MethodEditPanel } from "./MethodEditPanel";
import { TitleFields } from "./TitleFields";
import { UnsavedGuard } from "./UnsavedGuard";
import { useEditForm } from "./useEditForm";

/**
 * The form host — the child `RecipeEditPage` mounts on its success rung, and
 * the only file in `edit/` that may call form hooks (D22). `item` is
 * non-optional on purpose: the ladder's four early returns have already
 * proved the item loaded, is recipe-shaped and is `needs_review`, so
 * `useEditForm` / `useBlocker` / `useBeforeUnload` can be called
 * unconditionally here without any "is there an item yet" narrowing.
 *
 * Save sends `patchBody()` through `useUpdateKnowledgeItem`'s pass-through
 * seam and lands the reviewer on the read-mode recipe page (5.4 D4/D7). The
 * choreography lives here; `src/api/knowledgeItems.ts` is a fixed point.
 */
export function RecipeEditForm({
  item,
  draftRef,
}: {
  item: KnowledgeItemResponse;
  /* Reported upward so the page's status gate can tell a clean session from
     one holding unsaved work (review #1.2). Same pattern as `discardingRef`
     below: a ref, because it is read during the page's render rather than
     subscribed to. */
  draftRef: RefObject<{ id: string; dirty: boolean }>;
}) {
  const status = statusTone(item.knowledge_item.status);
  const { form, setField, setRows, newRow, isDirty, isValid, patchBody } =
    useEditForm(item);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  /* The failed-save message, rendered verbatim. TASK-007 hands this same field
     to `SaveConflict`, which picks its copy from the envelope's `code`. */
  const [saveError, setSaveError] = useState<Error | null>(null);

  /* The discard latch, owned here and read by two consumers that must agree:
     the Cancel handler below raises it, `UnsavedGuard`'s blocker reads it
     (D22). A ref, not state, precisely because it has to be readable in the
     same tick it is written — there is no re-render between the two lines of
     `onCancel`. */
  const discardingRef = useRef(false);

  const id = item.knowledge_item.id;
  /* Where BOTH exits land: Cancel, and a save that worked. One const rather
     than the expression twice, so the two destinations cannot drift.
     Either way the reviewer ends on the read page for this item, carrying
     this page's own return target one hop down so the recipe's back link
     still points where they came from (5.3 D13) — the rationale reads the
     same for a save as it does for a cancel, since a save is the *other* way
     of being finished here. The *validated* target travels, never the raw
     `?from=` — a rejected value is churn the recipe's `BackLink` discards
     anyway. `withReturnTo` captures a location and concatenates
     `pathname + search`, so the whole captured URL rides in `pathname`. */
  const target = readReturnTo(searchParams);
  const readHref = target
    ? withReturnTo(`/recipes/${id}`, { pathname: target.to, search: "" })
    : `/recipes/${id}`;

  /* One mutation, one intent, two buttons (D5): Save and TASK-004's Save &
     approve submit the same body and differ only in what follows. A ref, not
     state, for the reason `discardingRef` is one — the click handler writes it
     and `onSettled` reads it with no re-render in between. */
  const intentRef = useRef<"save" | "approve">("save");

  const update = useUpdateKnowledgeItem(id, {
    onError: (error) => setSaveError(error),
    /* The HOOK-level seam, never a per-call `onSuccess` (D4). It is composed
       AFTER the ['knowledge-item', id] write (knowledgeItems.ts:78-83), so a
       reader mounted from here is guaranteed the server's recomputed flags;
       and it is the one callback the hook isolates failures for, which is
       what TASK-004's chained approve depends on. Per-call callbacks also go
       unrun once this observer has no listeners (query-core's
       MutationObserver#notify) — and this component unmounts on navigate. */
    onSettled: (data, error) => {
      /* A failed patch is `onError`'s to report; there is nothing to leave
         for. */
      if (error !== null || data === undefined) {
        return;
      }
      if (intentRef.current === "save") {
        /* The latch, mandatory rather than defensive: a successful save does
           NOT make `useEditForm` clean — it compares against the seed
           snapshot, which the save never moves — so without this the guard
           would ask to discard the changes we just committed (D7). */
        discardingRef.current = true;
        navigate(readHref);
      }
    },
  });

  const onCancel = () => {
    discardingRef.current = true;
    navigate(readHref);
  };

  const onSave = () => {
    intentRef.current = "save";
    setSaveError(null);
    update.mutate(patchBody());
  };

  /* Keyed by item id, not a bare boolean: navigating from one dirty edit form
     straight to another item's would otherwise leave the flag set for an id
     that never had a draft. */
  useEffect(() => {
    draftRef.current = { id, dirty: isDirty };
  }, [draftRef, id, isDirty]);

  return (
    <div data-testid="recipe-edit-page">
      <UnsavedGuard isDirty={isDirty} discardingRef={discardingRef} />
      <Bloom duration={0.7} delay={0.04} className="pt-8">
        <BackLink />
      </Bloom>
      <Bloom duration={0.7} delay={0.08} className="pt-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow>Editing</Eyebrow>
          <Pill size="md" tone={status.tone}>
            {status.label}
          </Pill>
        </div>
        <h1 className="mt-5 font-display text-[clamp(30px,4vw,40px)] font-medium">
          Repair this <em className="text-accent italic">extraction.</em>
        </h1>
        <TitleFields form={form} isValid={isValid} setField={setField} />
        <FactsFields form={form} setField={setField} />
      </Bloom>
      {/* One full-width column, not the read page's
          `minmax(0,1fr)_minmax(0,1.7fr)` grid and not its sticky ingredients
          panel (D11): a 1fr column of textareas reintroduces exactly the
          cramping this epic moved editing off the queue card to escape. */}
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
        /* Wraps: TASK-004 adds a third control, and three pill buttons do not
           fit a 375px row. */
        className="mt-8 flex flex-wrap items-center gap-3"
      >
        <button
          type="button"
          onClick={onCancel}
          className="rounded-pill border border-border px-5 py-2 text-[13px] font-bold text-fg-muted pointer-coarse:min-h-11 hover:text-fg"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="edit-save"
          onClick={onSave}
          disabled={!isDirty || !isValid || update.isPending}
          /* accent-strong, not accent — the fifth solid-accent surface carrying
             `fg-on-accent`, and one 5.6's D12 enumeration missed: white on light
             `accent` measures 3.61:1, on `accent-strong` 4.63:1. Theme-agnostic
             like its four siblings; see SearchInput's Ask button. */
          className="rounded-pill bg-accent-strong px-5 py-2 text-[13px] font-bold text-fg-on-accent pointer-coarse:min-h-11 disabled:opacity-40"
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </button>
      </Bloom>
      {saveError && (
        /* The card's error idiom — announced, danger-toned, message verbatim.
           TASK-007 replaces this line with `SaveConflict` and its coded copy. */
        <p
          role="alert"
          className="mt-3 text-[12.5px] font-semibold text-danger"
        >
          {saveError.message}
        </p>
      )}
    </div>
  );
}
