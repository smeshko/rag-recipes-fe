import type { KnowledgeItemResponse } from "../../../api";
import { BackLink, Bloom, Eyebrow, Pill } from "../../../ui";
import { statusTone } from "../statusTone";
import { FactsFields } from "./FactsFields";
import { IngredientsEditPanel } from "./IngredientsEditPanel";
import { MethodEditPanel } from "./MethodEditPanel";
import { TitleFields } from "./TitleFields";
import { useEditForm } from "./useEditForm";

/**
 * The form host — the child `RecipeEditPage` mounts on its success rung, and
 * the only file in `edit/` that may call form hooks (D22). `item` is
 * non-optional on purpose: the ladder's four early returns have already
 * proved the item loaded, is recipe-shaped and is `needs_review`, so
 * `useEditForm` / `useBlocker` / `useBeforeUnload` can be called
 * unconditionally here without any "is there an item yet" narrowing.
 *
 * TASK-005 adds both line panels. The action row and `discardingRef` land in
 * TASK-006 — hence the deliberately partial destructure of `useEditForm`
 * below (`isDirty` and `patchBody` have no consumer until then).
 */
export function RecipeEditForm({ item }: { item: KnowledgeItemResponse }) {
  const status = statusTone(item.knowledge_item.status);
  const { form, setField, setRows, newRow, isValid } = useEditForm(item);

  return (
    <div data-testid="recipe-edit-page">
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
    </div>
  );
}
