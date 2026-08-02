import { Panel } from "../../../ui";
import type { LineListEditorProps } from "./LineListEditor";
import { LineListEditor } from "./LineListEditor";

/** Everything the panel needs is what the editor needs — the panel adds the
    shell, the heading and the copy, and binds nothing else. */
export type IngredientsEditPanelProps = Pick<
  LineListEditorProps,
  "rows" | "onChange" | "newRow"
>;

/**
 * The writable face of `IngredientsPanel`: the same `Panel` shell and the same
 * 19px display heading, so the edit surface reads as the read surface with the
 * rows made typeable.
 *
 * Two deliberate departures from read mode (D18): no sticky positioning — edit
 * mode is one full-width column (D11) — and no 17px checkbox square, because
 * check-off is a cooking affordance and means nothing while authoring the
 * list. `IngredientsPanel` itself is untouched.
 */
export function IngredientsEditPanel({
  rows,
  onChange,
  newRow,
}: IngredientsEditPanelProps) {
  return (
    <Panel>
      <h2 className="font-display text-[19px] font-semibold">Ingredients</h2>
      <p className="mt-1 text-[12.5px] text-fg-subtle">
        {rows.length} lines · one ingredient per line
      </p>
      <LineListEditor
        rows={rows}
        onChange={onChange}
        newRow={newRow}
        noun="ingredient"
        addLabel="+ Add ingredient"
      />
    </Panel>
  );
}
