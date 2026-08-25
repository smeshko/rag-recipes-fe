import { Link, useSearchParams } from "react-router";
import { readReturnTo, returnSection } from "./returnTo";

/* The touch floor here is `inline-block` + vertical padding, NOT
   `inline-flex` + min-height, and the difference is a visible bug.

   The search arm renders two children — the text run "← Back to results · "
   and an <em> holding the query. Under `inline-flex` each becomes its own
   anonymous flex item, and a flex item's trailing whitespace is trimmed, so
   the label collapsed to `← Back to results ·“breakfast”`. `inline-block`
   keeps an inline formatting context inside, so the space survives; padding
   grows the box symmetrically and centres the text without `items-center`.

   Guarded behind `pointer-coarse:` so the fine-pointer rendering — where the
   link is a plain inline box with no padding — is byte-identical to before. */
/* Muted grey that darkens to full foreground on hover, rather than turning
   accent-blue: the accent is reserved for links that go somewhere new, and a
   whole row of chrome flipping to blue under the pointer is the loudest thing
   on an otherwise flat page. Medium weight, not semibold — at 13px semibold
   reads as a heading competing with the recipe title directly below it. */
const CLASSES =
  "text-[13px] font-medium text-fg-muted transition-colors hover:text-fg pointer-coarse:inline-block pointer-coarse:py-3";

/**
 * One hop back, to wherever this screen was actually reached from — read from
 * the validated `?from=` target, never from `location.state`, so a reload or a
 * shared URL keeps the link.
 *
 * The label is *derived* from the target rather than passed in: a caller that
 * had to say "call me Back to review queue" would be a second place the
 * destination is written down, and the two would drift the moment an entry
 * point moved. Every arm below reads only the decoded target — the section
 * from `returnSection`, and, for search, the target's own `?q=` (the recipe
 * page has no `?q=` of its own to borrow).
 *
 * The fourth arm is a deliberate degrade, not an error path: no `from`, a
 * rejected `from`, or a bare `/` with nothing to name all render "← Back to
 * Cook" → `/`, which is exactly what a directly-loaded recipe showed before
 * this contract existed. Callers that must *not* degrade that way — the review
 * queue, which would otherwise grow a back link dumping the reviewer on
 * search — guard on `readReturnTo(...) !== null` before rendering this at all.
 */
export function BackLink() {
  const [searchParams] = useSearchParams();
  const target = readReturnTo(searchParams);
  const section = returnSection(target);

  if (target !== null && section === "review") {
    return (
      <Link to={target.to} className={CLASSES}>
        ← Back to review queue
      </Link>
    );
  }

  if (target !== null && section === "book") {
    return (
      <Link to={target.to} className={CLASSES}>
        ← Back to the book
      </Link>
    );
  }

  if (target !== null && section === "favourites") {
    return (
      <Link to={target.to} className={CLASSES}>
        ← Back to favourites
      </Link>
    );
  }

  if (target !== null && section === "library") {
    return (
      <Link to={target.to} className={CLASSES}>
        ← Back to your shelf
      </Link>
    );
  }

  const q = section === "search" ? (target?.params.get("q") ?? "") : "";
  if (target !== null && q !== "") {
    return (
      <Link to={target.to} className={CLASSES}>
        ← Back to results · <em className="italic">“{q}”</em>
      </Link>
    );
  }

  return (
    <Link to="/" className={CLASSES}>
      ← Back to Cook
    </Link>
  );
}
