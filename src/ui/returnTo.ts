import { matchPath } from "react-router";

/**
 * The `?from=` return-target contract: where a screen was reached from,
 * carried in the URL rather than in `location.state`, so a reload keeps the
 * back link. Writer, reader, validator and section classifier live in one
 * module — the `reviewQueueUrl.ts` precedent — because an emitter and a
 * decoder that drift produce a back link pointing somewhere the user never
 * was.
 *
 * An unvalidated `from` is not a typo risk, it is an open redirect: it lands
 * in an `href`, and `//evil.com` or `/\evil.com` both start with `/` and both
 * leave the origin in a browser. Hence four rules, in order — starts with
 * `/`; second character is neither `/` nor `\`; the pathname half matches one
 * of RETURN_TO_ROUTES; otherwise `null`. `null` is the same degrade as a
 * missing `from`, silently: a bad value is a hand-edited URL, not an
 * exception.
 *
 * Things worth knowing that the signatures do not say:
 * - RETURN_TO_ROUTES is a local copy of the route table's real paths, not an
 *   import from `routes.tsx` (that would close a cycle through Shell → Nav),
 *   and it deliberately omits the `*` catch-all, which would otherwise accept
 *   every string on earth. A test in `tests/ui/returnTo.test.ts` fails the
 *   suite if the two lists drift.
 * - Only the **pathname** half of an accepted target is validated; its query
 *   rides along unchecked. That is safe for `<Link to>`, which parses the
 *   string into `{pathname, search, hash}` and cannot leave the origin. It
 *   would not be safe to hand `target.to` to `window.location` or a
 *   hand-built `<a href>`.
 * - `matchPath` is case-insensitive, so `/LIBRARY` is an accepted target.
 *   That is correct: the router resolves it too.
 * - "Validated" and "linked to" are different sets. `/recipes/x` passes
 *   `readReturnTo` but classifies as `null` in `returnSection`, so a back
 *   link built from it falls back to Cook.
 * - `withReturnTo` appends a `from` without checking whether `to` already
 *   carries one. No call site produces that today, and `searchParams.get`
 *   would take the first.
 */

/**
 * The real routes from `src/routes.tsx`, minus two deliberate exclusions: the
 * `*` catch-all, which would accept every string on earth, and
 * `/recipes/:id/edit` — a back link that returns a user to a form they
 * abandoned is wrong, and admitting the path would let a hand-edited
 * `?from=/recipes/x/edit` aim a recipe page's back link into the editor.
 */
export const RETURN_TO_ROUTES = [
  "/",
  "/recipes/:id",
  "/library",
  "/library/:documentId",
  "/review",
] as const;

const FROM_PARAM = "from";

/**
 * Appends the current location to `to` as a single `from` param. Built with
 * URLSearchParams rather than a bare `encodeURIComponent` so it cannot be
 * double-encoded by accident and `searchParams.get` decodes it symmetrically.
 */
export function withReturnTo(
  to: string,
  from: { pathname: string; search: string },
): string {
  const param = new URLSearchParams({
    [FROM_PARAM]: from.pathname + from.search,
  });
  return `${to}${to.includes("?") ? "&" : "?"}${param.toString()}`;
}

/**
 * Rules 1 and 2: an app-internal path, not another origin in disguise. Also
 * the guard for the remembered last-search URL, which is the same "safe to
 * hand to `<Link to>`" question.
 */
export function isInternalPath(value: string): boolean {
  return value.startsWith("/") && value[1] !== "/" && value[1] !== "\\";
}

export interface ReturnTarget {
  /** The captured URL verbatim — what a back link is `to`. */
  to: string;
  /** Its pathname half, the part that was validated. */
  pathname: string;
  /** Its own query, so a label can read the target's `?q=`. */
  params: URLSearchParams;
}

/**
 * The reader half. Returns `null` for a missing, off-origin or unroutable
 * `from`. The value from `searchParams.get` is already percent-decoded — a
 * second `decodeURIComponent` pass would turn a literal `%2F` inside a nested
 * target into a `/` and throw on a lone `%`.
 */
export function readReturnTo(
  searchParams: URLSearchParams,
): ReturnTarget | null {
  const to = searchParams.get(FROM_PARAM);
  if (to === null || !isInternalPath(to)) {
    return null;
  }
  /* matchPath matches pathnames only: matchPath("/", "/?q=x") is a legal call
     that simply returns null, so the query has to come off before matching. */
  const hashAt = to.indexOf("#");
  const path = hashAt === -1 ? to : to.slice(0, hashAt);
  const queryAt = path.indexOf("?");
  const pathname = queryAt === -1 ? path : path.slice(0, queryAt);
  if (!RETURN_TO_ROUTES.some((pattern) => matchPath(pattern, pathname))) {
    return null;
  }
  return {
    to,
    pathname,
    params: new URLSearchParams(queryAt === -1 ? "" : path.slice(queryAt)),
  };
}

export type ReturnSection = "search" | "library" | "book" | "review";

/**
 * Which part of the app a target belongs to — all Nav needs, and the split
 * BackLink's label arms key off. `/review` matches with `end: false` so the
 * classification holds for any future child of the queue.
 *
 * A book's contents page is its OWN section rather than a child of `library`,
 * and the order below is what makes that work: `matchPath("/library", …)`
 * defaults to `end: true`, so it would return null for `/library/doc_x` and
 * the target would fall all the way through to the Cook degrade. Naming it
 * separately (instead of relaxing the `/library` match to `end: false`) is
 * what lets a back link say "the book" rather than "your shelf" — two
 * different places, and the shelf link would send a reader one hop too far.
 */
export function returnSection(
  target: ReturnTarget | null,
): ReturnSection | null {
  if (target === null) {
    return null;
  }
  if (matchPath({ path: "/review", end: false }, target.pathname)) {
    return "review";
  }
  if (matchPath("/library/:documentId", target.pathname)) {
    return "book";
  }
  if (matchPath("/library", target.pathname)) {
    return "library";
  }
  if (matchPath("/", target.pathname)) {
    return "search";
  }
  return null;
}
