import { Link } from "react-router";
import { Panel } from "../../../ui";
import { statusTone } from "../statusTone";

/**
 * The one pre-form state the read page has no equivalent for: the item loaded
 * fine and is recipe-shaped, but it is not waiting for review, so there is
 * nothing here to repair. Not-found, error and not-a-recipe reuse
 * `RecipeStates` verbatim — this file exists so no read-mode file grows an
 * edit-only branch (D3).
 *
 * Calm, not danger-toned: an already-approved item is an expected dead end.
 * The subline echoes the item's *actual* status through `statusTone`, so an
 * unrecognised backend status still names itself rather than hiding behind
 * the generic headline.
 */
export function NotEditable({
  status,
  id,
}: {
  status: string;
  id: string | undefined;
}) {
  const { label } = statusTone(status);
  return (
    <div className="pt-16">
      <Panel className="mx-auto max-w-[560px] text-center">
        <p className="font-display text-[18px] font-semibold">
          {status === "ready"
            ? "This one's already on the shelf."
            : "This item isn't waiting for review."}
        </p>
        <p className="mt-1 text-[13.5px] text-fg-muted">
          Only items that need review can be edited. This one is{" "}
          <b className="font-semibold">{label}</b>.
        </p>
        <p className="mt-5">
          <Link
            to={`/recipes/${id}`}
            className="text-[12.5px] font-bold text-accent hover:underline"
          >
            View the recipe →
          </Link>
        </p>
      </Panel>
    </div>
  );
}
