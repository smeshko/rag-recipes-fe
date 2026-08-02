import { Link, useSearchParams } from "react-router";
import { readReturnTo, returnSection } from "./returnTo";

const CLASSES =
  "inline-flex items-center text-[13px] font-semibold text-fg-muted transition-colors hover:text-accent pointer-coarse:min-h-11";

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
