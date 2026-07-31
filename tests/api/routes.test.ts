import { request, route } from "../../src/api";

/* The @ts-expect-error lines below are the negative half of this suite: they
   are checked by `just build` (tsconfig.test.json covers tests/), and TS fails
   the build with "Unused '@ts-expect-error' directive" if any of them ever
   stops being an error. Vitest itself does not type-check. */

describe("route", () => {
  it("interpolates a path parameter", () => {
    expect(
      route("/documents/{document_id}", "get", { document_id: "abc" }),
    ).toBe("/documents/abc");
  });

  it("interpolates every parameter of a multi-segment template", () => {
    expect(
      route("/documents/{document_id}/status", "get", { document_id: "abc" }),
    ).toBe("/documents/abc/status");
  });

  it("percent-encodes parameter values", () => {
    expect(
      route("/knowledge-items/{item_id}", "get", { item_id: "a b/c" }),
    ).toBe("/knowledge-items/a%20b%2Fc");
  });

  it("returns a paramless template unchanged", () => {
    expect(route("/health", "get")).toBe("/health");
  });

  it("throws when a declared parameter is missing at runtime", () => {
    expect(() =>
      route("/documents/{document_id}", "get", {
        document_id: undefined as unknown as string,
      }),
    ).toThrow("Missing path parameter 'document_id'");
  });
});

/* Each body below is declared but never invoked — the compiler is the
   assertion. Calls are kept on one line so the formatter cannot move an
   error off the line its directive guards. */
const doc = "/documents/{document_id}";

describe("route typing (compile-time)", () => {
  it("rejects invalid routes, methods and parameters", () => {
    const checks = () => {
      // @ts-expect-error — route not in the generated schema
      route("/helth", "get");
      // @ts-expect-error — the schema declares no POST on this route
      route(doc, "post", { document_id: "a" });
      // @ts-expect-error — wrong path parameter name
      route(doc, "get", { id: "a" });
      // @ts-expect-error — a parameterized route needs its parameters
      route(doc, "get");
    };
    expect(checks).toBeTypeOf("function");
  });
});

describe("request typing (compile-time)", () => {
  it("rejects paths that did not come from the schema", () => {
    const checks = () => {
      // @ts-expect-error — misspelled paramless route
      request("/helth");
      // @ts-expect-error — hand-interpolated path, must go through route()
      request("/documents/does-not-exist");
      // @ts-expect-error — an uninterpolated template is not a path
      request(doc);
    };
    expect(checks).toBeTypeOf("function");
  });
});
