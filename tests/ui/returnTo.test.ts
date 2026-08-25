import { routes } from "../../src/routes";
import {
  isInternalPath,
  RETURN_TO_ROUTES,
  type ReturnTarget,
  readReturnTo,
  returnSection,
  withReturnTo,
} from "../../src/ui/returnTo";

/* The whole contract is pure string work, so these are unit tests: no
   router, no render. The rejection describe is the phase's security
   surface — every case there is a `from` a hand-edited URL can carry. */

function fromParams(value: string): URLSearchParams {
  return new URLSearchParams({ from: value });
}

function readFrom(value: string): ReturnTarget | null {
  return readReturnTo(fromParams(value));
}

describe("withReturnTo", () => {
  it("appends an encoded from to a plain target", () => {
    expect(
      withReturnTo("/recipes/x", {
        pathname: "/review",
        search: "?document=d1",
      }),
    ).toBe("/recipes/x?from=%2Freview%3Fdocument%3Dd1");
  });

  it("round-trips that param back to the captured URL", () => {
    const to = withReturnTo("/recipes/x", {
      pathname: "/review",
      search: "?document=d1",
    });
    const target = readReturnTo(new URLSearchParams(to.slice(to.indexOf("?"))));

    expect(target?.to).toBe("/review?document=d1");
  });

  it("joins with & when the target already carries a query string", () => {
    const to = withReturnTo("/recipes/x?tab=notes", {
      pathname: "/library",
      search: "",
    });

    expect(to).toBe("/recipes/x?tab=notes&from=%2Flibrary");
    expect(
      new URLSearchParams(to.slice(to.indexOf("?"))).getAll("from"),
    ).toEqual(["/library"]);
  });

  it("captures a bare / with no search", () => {
    expect(withReturnTo("/recipes/x", { pathname: "/", search: "" })).toBe(
      "/recipes/x?from=%2F",
    );
    expect(readFrom("/")?.to).toBe("/");
  });

  it("keeps a space and a literal + distinct through the round trip", () => {
    const to = withReturnTo("/recipes/x", {
      pathname: "/",
      search: "?q=cheese scones",
    });

    expect(to).toBe("/recipes/x?from=%2F%3Fq%3Dcheese+scones");
    expect(readFrom("/?q=cheese scones")?.to).toBe("/?q=cheese scones");
    expect(readFrom("/?q=a+b")?.to).toBe("/?q=a+b");
    expect(readFrom("/?q=a+b")?.params.get("q")).toBe("a b");
  });
});

describe("readReturnTo", () => {
  it.each(["/", "/recipes/x", "/library", "/review"])(
    "accepts the routable target %s",
    (path) => {
      expect(readFrom(path)).toEqual({
        to: path,
        pathname: path,
        params: new URLSearchParams(),
      });
    },
  );

  it("exposes the target's own query through params", () => {
    const target = readFrom("/?q=scones&mode=vector");

    expect(target?.to).toBe("/?q=scones&mode=vector");
    expect(target?.pathname).toBe("/");
    expect(target?.params.get("q")).toBe("scones");
    expect(target?.params.get("mode")).toBe("vector");
  });

  it("round-trips a nested from, from and all", () => {
    const nested = "/review?document=d1&from=%2Flibrary";
    const to = withReturnTo("/recipes/x", {
      pathname: "/review",
      search: "?document=d1&from=%2Flibrary",
    });
    const target = readReturnTo(new URLSearchParams(to.slice(to.indexOf("?"))));

    expect(target?.to).toBe(nested);
    expect(target?.params.get("from")).toBe("/library");
  });

  it("accepts the router's own case-insensitive spelling", () => {
    expect(readFrom("/LIBRARY")?.to).toBe("/LIBRARY");
  });
});

describe("readReturnTo rejects", () => {
  it("a missing from", () => {
    expect(readReturnTo(new URLSearchParams())).toBeNull();
  });

  it.each([
    ["an empty from", ""],
    ["an absolute URL", "https://evil.com/x"],
    ["a protocol-relative URL", "//evil.com"],
    ["a backslash-escaped host", "/\\evil.com"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["an unroutable path", "/nope"],
    ["a recipe with no id", "/recipes"],
    ["a path below the recipe leaf", "/recipes/a/b"],
    ["a prefix impostor", "/recipes-old"],
  ])("%s", (_label, value) => {
    expect(readFrom(value)).toBeNull();
  });

  it("agrees with isInternalPath on the off-origin forms", () => {
    expect(isInternalPath("/library")).toBe(true);
    expect(isInternalPath("")).toBe(false);
    expect(isInternalPath("https://evil.com/x")).toBe(false);
    expect(isInternalPath("//evil.com")).toBe(false);
    expect(isInternalPath("/\\evil.com")).toBe(false);
    expect(isInternalPath("javascript:alert(1)")).toBe(false);
  });
});

describe("returnSection", () => {
  function target(to: string, pathname = to): ReturnTarget {
    return { to, pathname, params: new URLSearchParams() };
  }

  it.each([
    ["/review", "/review", "review"],
    ["/review?document=d1", "/review", "review"],
    ["/review/x", "/review/x", "review"],
    ["/library", "/library", "library"],
    ["/", "/", "search"],
    ["/?q=scones", "/", "search"],
    ["/recipes/x", "/recipes/x", null],
  ])("maps a target of %s (pathname %s) to %s", (to, pathname, expected) => {
    expect(returnSection(target(to, pathname))).toBe(expected);
  });

  it("maps a rejected target to null", () => {
    expect(returnSection(null)).toBeNull();
  });
});

describe("RETURN_TO_ROUTES", () => {
  /* Two documented exclusions, not a loosened check — a subset assertion here
     would kill the tripwire that catches a new route nobody taught the back
     link about. `*` would accept every string on earth; `/recipes/:id/edit` is
     a form, and a back link that returns a user to one they abandoned is
     wrong — worse, admitting it would let a hand-edited `?from=/recipes/x/edit`
     aim a recipe page's back link into the editor. */
  const EXCLUDED = ["*", "/recipes/:id/edit"];

  it("stays in step with the route table, catch-all and edit excluded", () => {
    const childPaths = (routes[0].children ?? []).map((route) => route.path);

    expect(new Set(childPaths)).toEqual(
      new Set([...RETURN_TO_ROUTES, ...EXCLUDED]),
    );
  });

  it("rejects the edit route as a return target", () => {
    expect(readFrom("/recipes/x/edit")).toBeNull();
  });
});
