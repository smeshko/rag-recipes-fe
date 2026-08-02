import type { SearchMode } from "../../api/search";
import { parseMode } from "./mode";

/**
 * The search URL's param rules, in exactly one place. Every commit on the
 * search screen — Enter, Ask, a mode chip — rides through `writeParams`, and
 * `writeParams` rides through here: once inside `setSearchParams`' functional
 * updater (which must stay pure) and once against this render's params to
 * produce the string the Cook pill remembers. Same function both times, so
 * the URL the user sees and the URL that is stored cannot describe different
 * searches — which is precisely what the JSON-record store used to allow, by
 * re-deriving the hybrid and review rules a second time.
 */

/** What a commit says; everything else in `prev` is somebody else's param. */
export interface SearchCommit {
  q: string;
  mode: SearchMode;
  /** True only on the write that arms the entry (Ask). */
  asked: boolean;
}

/**
 * The next URL's params. Pure: `prev` is never mutated, so it is safe inside
 * a `setSearchParams` updater that React may invoke more than once.
 *
 * The rules, all of them:
 * - unknown params survive (`review=included`, `from`, anything a later epic
 *   adds) — in their own order, after `q`;
 * - an empty `q` is deleted rather than written as `?q=`;
 * - `hybrid` stays out of the URL: it is the default the parser returns for a
 *   missing `mode`, so writing it would be noise;
 * - `asked=1` is set by the ask itself, and otherwise survives only while the
 *   question is unchanged. The ask is `{q, mode, corpus}`, so a new query or a
 *   mode chip addresses a cache entry nobody asked for; leaving the arming on
 *   it would claim an answer that cannot exist (PLAN.md D9).
 */
export function nextSearchParams(
  prev: URLSearchParams,
  next: SearchCommit,
): URLSearchParams {
  const params = new URLSearchParams();
  /* q first, then the unknowns, then mode and asked: a canonical order, so a
     remembered URL is byte-identical to the URL that produced it however the
     screen was reached. */
  if (next.q) {
    params.set("q", next.q);
  }
  for (const [key, value] of prev) {
    if (key !== "q" && key !== "mode" && key !== "asked") {
      params.append(key, value);
    }
  }
  if (next.mode !== "hybrid") {
    params.set("mode", next.mode);
  }
  const sameQuestion =
    next.q === (prev.get("q") ?? "") &&
    next.mode === parseMode(prev.get("mode"));
  if (next.asked || (sameQuestion && prev.get("asked") === "1")) {
    params.set("asked", "1");
  }
  return params;
}

/** Those params as a path: `/?…`, or the bare `/` when there are none. */
export function searchUrl(params: URLSearchParams): string {
  const query = params.toString();
  return query === "" ? "/" : `/?${query}`;
}
