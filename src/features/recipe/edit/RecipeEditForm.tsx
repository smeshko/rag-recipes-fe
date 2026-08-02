import { type RefObject, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  type KnowledgeItemResponse,
  useReviewDecision,
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
import { SaveConflict } from "./EditStates";
import { FactsFields } from "./FactsFields";
import { IngredientsEditPanel } from "./IngredientsEditPanel";
import { MethodEditPanel } from "./MethodEditPanel";
import { TitleFields } from "./TitleFields";
import { UnsavedGuard } from "./UnsavedGuard";
import { useEditForm } from "./useEditForm";

/** A rejected `mutateAsync` is typed `unknown` at the catch site; every
    rejection the client produces is an `ApiError`, so this is the narrow that
    keeps the house rule (render the backend's message verbatim) honest
    without asserting a type the compiler cannot see. */
const messageOf = (failure: unknown): string =>
  failure instanceof Error ? failure.message : String(failure);

/**
 * The form host — the child `RecipeEditPage` mounts on its success rung, and
 * the only file in `edit/` that may call form hooks (D22). `item` is
 * non-optional on purpose: the ladder's four early returns have already
 * proved the item loaded, is recipe-shaped and is `needs_review`, so
 * `useEditForm` / `useBlocker` / `useBeforeUnload` can be called
 * unconditionally here without any "is there an item yet" narrowing.
 *
 * Save sends `patchBody()` through `useUpdateKnowledgeItem`'s pass-through
 * seam and lands the reviewer on the read-mode recipe page (5.4 D4/D7); Save &
 * approve chains `useReviewDecision` onto the same seam and returns them to
 * the queue (D8). The choreography lives here; `src/api/knowledgeItems.ts` and
 * `src/api/review.ts` are both fixed points.
 */
export function RecipeEditForm({
  item,
  draftRef,
  conflictStatus,
}: {
  item: KnowledgeItemResponse;
  /* Reported upward so the page's status gate can tell a clean session from
     one holding unsaved work (review #1.2). Same pattern as `discardingRef`
     below: a ref, because it is read during the page's render rather than
     subscribed to. */
  draftRef: RefObject<{ id: string; dirty: boolean }>;
  /* Set only when the page held the form open over an item that has since
     left `needs_review` — the proactive half of the conflict surface. The
     page owns the observation because the page is what re-evaluates the
     status gate on every cache update. */
  conflictStatus?: string;
}) {
  const status = statusTone(item.knowledge_item.status);
  const { form, setField, setRows, newRow, isDirty, isValid, patchBody } =
    useEditForm(item);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  /* The refused save, handed to `SaveConflict`, which picks its copy from the
     envelope's `code` and falls back to the message verbatim. */
  const [saveError, setSaveError] = useState<Error | null>(null);
  /* A DOWNSTREAM failure, kept apart from `saveError` on purpose: the patch
     committed, so this is not a failed save and must never render as one —
     `SaveConflict` gives it its own, reassuring arm. */
  const [approveError, setApproveError] = useState<string | null>(null);

  /* The discard latch, owned here and read by two consumers that must agree:
     the Cancel handler below raises it, `UnsavedGuard`'s blocker reads it
     (D22). A ref, not state, precisely because it has to be readable in the
     same tick it is written — there is no re-render between the two lines of
     `onCancel`. */
  const discardingRef = useRef(false);

  /* Still on this page? The seam below is a HOOK-level callback, so query-core
     keeps it on the mutation's own options and runs it even after this
     component has gone (`MutationObserver#onUnsubscribe` drops the observer,
     not the options) — and `useNavigate` has no unmount guard of its own
     (react-router's `activeRef` is raised in a layout effect and never
     lowered). Cancel, `BackLink` and the whole `Nav` stay live while
     `update.isPending`, so a reviewer who leaves mid-save would otherwise be
     yanked out of wherever they went the moment the patch landed — to
     `/review`, on the approve path. The post-save navigation is only ever
     ours to make while we are the page the reviewer is looking at (review
     #1.1). */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
  /* Where an APPROVE lands: the validated target itself, not a hop through the
     recipe. A reviewer who arrived from the filtered queue returns to it with
     `?document=` intact; one who arrived from the library or search returns
     there; a direct load falls back to the unfiltered queue, which is the only
     honest guess once the item they just settled is no longer in it. */
  const queueHref = target?.to ?? "/review";

  /* One mutation, one intent, two buttons (D5): Save and TASK-004's Save &
     approve submit the same body and differ only in what follows. A ref, not
     state, for the reason `discardingRef` is one — the click handler writes it
     and `onSettled` reads it with no re-render in between. */
  const intentRef = useRef<"save" | "approve">("save");

  /* No options (D8). The hook's own composed settle already invalidates
     ['review-items'], ['documents'] and the exact ['document', id]; there is
     no card here to optimistically remove, so inventing an `onMutate` would
     only duplicate 4.3's rollback logic for nothing. Note what it does NOT
     invalidate: ['knowledge-item', id] — which is why approving does not
     refetch a now-decided item under this still-dirty form and provoke the
     conflict banner on a save that worked (D11). */
  const decide = useReviewDecision(id);

  const update = useUpdateKnowledgeItem(id, {
    onError: (error) => setSaveError(error),
    /* The HOOK-level seam, never a per-call `onSuccess` (D4). It is composed
       AFTER the ['knowledge-item', id] write (knowledgeItems.ts:78-83), so a
       reader mounted from here is guaranteed the server's recomputed flags;
       and it is the one callback the hook isolates failures for, which is
       what TASK-004's chained approve depends on. Per-call callbacks also go
       unrun once this observer has no listeners (query-core's
       MutationObserver#notify) — and this component unmounts on navigate. */
    onSettled: async (data, error) => {
      /* A failed patch is `onError`'s to report; there is nothing to leave
         for — and, structurally rather than by ordering care, no decision is
         ever fired on an item whose repair did not commit. */
      if (error !== null || data === undefined) {
        return;
      }
      if (intentRef.current === "approve") {
        /* try/catch INSIDE the callback, never around it (D8). The seam
           catches and logs an escaping rejection, so letting one out would
           lose the navigation AND the message; and a rejection reaching
           query-core's own await would re-run this callback with
           `(undefined, error)` and report a committed patch as a failed save
           (knowledgeItems.ts:119-142). `mutateAsync`, not `mutate`, because
           where to go next depends on whether the approve worked. */
        try {
          await decide.mutateAsync("approved");
        } catch (failure) {
          setApproveError(messageOf(failure));
          return;
        }
      }
      /* The reviewer left while this was in flight: the patch committed and,
         on the approve path, the decision they asked for went through — but
         where they are now is their choice, not ours. Deliberately placed
         AFTER the approve rather than before it: they pressed "Save &
         approve", the patch is already on the server, and dropping the second
         half would leave the item edited-but-still-queued with nothing on
         screen to say so. What we drop is the navigation, not the act. */
      if (!mountedRef.current) {
        return;
      }
      /* The latch, mandatory rather than defensive: a successful save does
         NOT make `useEditForm` clean — it compares against the seed snapshot,
         which the save never moves — so without this the guard would ask to
         discard the changes we just committed (D7). */
      discardingRef.current = true;
      navigate(intentRef.current === "approve" ? queueHref : readHref);
    },
  });

  const onCancel = () => {
    discardingRef.current = true;
    navigate(readHref);
  };

  /* One body, one mutation, two buttons (D5) — only the intent differs. */
  const submit = (intent: "save" | "approve") => () => {
    intentRef.current = intent;
    setSaveError(null);
    setApproveError(null);
    update.mutate(patchBody());
  };

  /* Both buttons: an empty patch is a 400 `invalid_request`, and approving an
     unedited item is the queue card's job. `decide.isPending` joins the rule
     so a second click cannot start a second patch mid-approve. */
  const submitDisabled =
    !isDirty || !isValid || update.isPending || decide.isPending;

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
        {/* Above the fields, below the head: whichever trigger raised it, a
            conflict is the first thing to read after the title — not a line
            discovered under the action row once the reviewer scrolls. */}
        <SaveConflict
          status={conflictStatus}
          error={saveError}
          approveError={approveError}
        />
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
          onClick={submit("save")}
          disabled={submitDisabled}
          /* accent-strong, not accent — the fifth solid-accent surface carrying
             `fg-on-accent`, and one 5.6's D12 enumeration missed: white on light
             `accent` measures 3.61:1, on `accent-strong` 4.63:1. Theme-agnostic
             like its four siblings; see SearchInput's Ask button. */
          className="rounded-pill bg-accent-strong px-5 py-2 text-[13px] font-bold text-fg-on-accent pointer-coarse:min-h-11 disabled:opacity-40"
        >
          {/* `&& !decide.isPending`: query-core holds the patch mutation
              `pending` until this seam's callback resolves, so during the
              chained approve the patch is technically still in flight — but
              "Saving…" alongside "Approving…" names one act twice. */}
          {update.isPending && !decide.isPending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          data-testid="edit-save-approve"
          onClick={submit("approve")}
          disabled={submitDisabled}
          /* Approve's own vocabulary, verbatim from `ReviewItemCard` (D13):
             the two surfaces name the same verb the same way, so a reviewer
             reads one control, not two. */
          className="rounded-pill bg-success-fill px-5 py-2 text-[13px] font-bold text-success pointer-coarse:min-h-11 disabled:opacity-40"
        >
          {decide.isPending ? "Approving…" : "Save & approve"}
        </button>
      </Bloom>
    </div>
  );
}
