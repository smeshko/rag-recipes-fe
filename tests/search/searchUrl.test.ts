import type { SearchMode } from "../../src/api/search";
import {
  nextSearchParams,
  searchUrl,
} from "../../src/features/search/searchUrl";

/* The URL rules, exercised as pure functions — no render, no storage. This
   block used to live in lastSearch.test.tsx next to the sessionStorage
   restore that reads these URLs back; it moved here because it is a
   pure-function contract, not a storage test. The param rules are what every
   commit on the search screen writes through. */

describe("nextSearchParams / searchUrl (the param rules, in one place)", () => {
  const commit = (
    prev: string,
    q: string,
    mode: SearchMode,
    asked = false,
    menu = false,
  ): string =>
    searchUrl(
      nextSearchParams(new URLSearchParams(prev), { q, mode, asked, menu }),
    );

  it("arms menu=1 on the compose write and drops a standing asked=1", () => {
    expect(commit("q=muffins&asked=1", "muffins", "hybrid", false, true)).toBe(
      "/?q=muffins&menu=1",
    );
  });

  it("keeps menu=1 only while the question is unchanged, like asked=1", () => {
    expect(commit("q=muffins&menu=1", "muffins", "hybrid")).toBe(
      "/?q=muffins&menu=1",
    );
    expect(commit("q=muffins&menu=1", "muffins", "vector")).toBe(
      "/?q=muffins&mode=vector",
    );
    expect(commit("q=muffins&menu=1", "muffins", "hybrid", true)).toBe(
      "/?q=muffins&asked=1",
    );
  });

  it("keeps unknown params — they belong to somebody else", () => {
    expect(commit("review=included&future=param", "muffins", "hybrid")).toBe(
      "/?q=muffins&review=included&future=param",
    );
  });

  it("keeps hybrid out of the URL and deletes a mode that was there", () => {
    expect(commit("", "scones", "hybrid")).toBe("/?q=scones");
    expect(commit("q=scones&mode=vector", "scones", "hybrid")).toBe(
      "/?q=scones",
    );
    expect(commit("q=scones", "scones", "vector")).toBe(
      "/?q=scones&mode=vector",
    );
  });

  it("sets asked=1 on the write that arms the entry", () => {
    expect(commit("q=scones", "scones", "hybrid", true)).toBe(
      "/?q=scones&asked=1",
    );
  });

  it("drops asked when the question changed, keeps it when it did not", () => {
    /* A new q or a mode chip addresses a cache entry nobody asked for. */
    expect(commit("q=scones&asked=1", "muffins", "hybrid")).toBe("/?q=muffins");
    expect(commit("q=scones&asked=1", "scones", "vector")).toBe(
      "/?q=scones&mode=vector",
    );
    expect(commit("q=scones&asked=1", "scones", "hybrid")).toBe(
      "/?q=scones&asked=1",
    );
  });

  it("deletes an emptied q, and empty params are the bare /", () => {
    expect(commit("q=scones", "", "hybrid")).toBe("/");
    expect(searchUrl(new URLSearchParams())).toBe("/");
  });
});
