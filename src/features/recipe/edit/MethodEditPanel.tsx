import { Panel } from "../../../ui";
import type { LineListEditorProps } from "./LineListEditor";
import { LineListEditor } from "./LineListEditor";

export type MethodEditPanelProps = Pick<
  LineListEditorProps,
  "rows" | "onChange" | "newRow"
>;

/**
 * The writable face of `MethodPanel`. It differs from `IngredientsEditPanel`
 * in exactly four things — the heading, the subline copy, `ordered` and the
 * list it binds. Anything that would make it differ in a fifth belongs in
 * `LineListEditor`'s props, not in a second copy of this file.
 *
 * **No step number is stored or sent.** The step ordinal is `index + 1` at
 * render, so a reorder or a removal renumbers the method by construction, and
 * `patchBody()` sends `steps: string[]` in array order for the backend to
 * number from position (D9). The read panel's careful preservation of a gapped
 * payload numbering (`[1, 2, 4]` is evidence of a dropped step) is a *reader's*
 * concern; here the reviewer is authoring the order.
 */
export function MethodEditPanel({
  rows,
  onChange,
  newRow,
}: MethodEditPanelProps) {
  return (
    <Panel>
      <h2 className="text-[18px] font-semibold tracking-[-0.01em]">Method</h2>
      <p className="mt-1 text-[13px] text-fg-subtle">
        {rows.length} steps · numbered as you order them
      </p>
      <LineListEditor
        rows={rows}
        onChange={onChange}
        newRow={newRow}
        ordered
        noun="step"
        addLabel="+ Add step"
      />
    </Panel>
  );
}
