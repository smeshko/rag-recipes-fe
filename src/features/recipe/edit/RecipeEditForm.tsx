import type { KnowledgeItemResponse } from "../../../api";
import { BackLink, Bloom, Eyebrow, Pill } from "../../../ui";
import { statusTone } from "../statusTone";

/**
 * The form host — the child `RecipeEditPage` mounts on its success rung, and
 * the only file in `edit/` that may call form hooks (D22). `item` is
 * non-optional on purpose: the ladder's four early returns have already
 * proved the item loaded, is recipe-shaped and is `needs_review`, so
 * `useEditForm` / `useBlocker` / `useBeforeUnload` can be called
 * unconditionally here without any "is there an item yet" narrowing.
 *
 * TASK-001 ships the chrome only. The fields, both line editors, the action
 * row and `discardingRef` land in TASK-002 … TASK-006.
 */
export function RecipeEditForm({ item }: { item: KnowledgeItemResponse }) {
  const status = statusTone(item.knowledge_item.status);

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
      </Bloom>
    </div>
  );
}
