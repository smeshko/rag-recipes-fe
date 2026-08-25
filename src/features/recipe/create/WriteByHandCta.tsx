import { Link, useLocation } from "react-router";
import { Panel, withReturnTo } from "../../../ui";

/**
 * The shelf's way in to `/recipes/new`: a calm second option under the
 * dropzone, for the recipe that never came out of a book.
 *
 * It lives in `create/` rather than in `library/` so the create surface owns
 * both halves of its own entry — the page and the door. The library page only
 * decides *where* it sits.
 *
 * It captures its own return target rather than taking one as a prop: the
 * whole point of `?from=` is that the destination knows where the user came
 * from without every caller having to say so, and a second entry point (a
 * search dead end, say) would then get the back link right for free.
 */
export function WriteByHandCta() {
  const location = useLocation();

  return (
    <Panel className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div>
        <b className="block font-display text-[17px] font-semibold">
          Or write one down
        </b>
        <small className="mt-[3px] block text-[13.5px] text-fg-muted">
          A recipe of your own, or one that never came out of a book
        </small>
      </div>
      {/* `inline-flex items-center` is load-bearing on a Link, not decoration:
          min-height has no effect on an inline box (Nav.tsx's note). */}
      <Link
        to={withReturnTo("/recipes/new", location)}
        data-testid="write-by-hand"
        className="inline-flex items-center rounded-pill bg-accent-strong px-5 py-2 text-[13px] font-bold text-fg-on-accent pointer-coarse:min-h-11"
      >
        Add a recipe
      </Link>
    </Panel>
  );
}
