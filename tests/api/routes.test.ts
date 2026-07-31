import { request, route } from "../../src/api";

/* The @ts-expect-error lines below are the negative half of this suite: they
   are checked by `just build` (tsconfig.test.json covers tests/), and TS fails
   the build with "Unused '@ts-expect-error' directive" if any of them ever
   stops being an error. Vitest itself does not type-check. */

describe("route", () => {
  it("interpolates a path parameter", () => {
    const endpoint = route("/documents/{document_id}", "get", {
      params: { document_id: "abc" },
    });
    expect(endpoint.path).toBe("/documents/abc");
    expect(endpoint.method).toBe("GET");
  });

  it("interpolates every parameter of a multi-segment template", () => {
    const endpoint = route("/documents/{document_id}/status", "get", {
      params: { document_id: "abc" },
    });
    expect(endpoint.path).toBe("/documents/abc/status");
  });

  it("percent-encodes parameter values", () => {
    const endpoint = route("/knowledge-items/{item_id}", "get", {
      params: { item_id: "a b/c" },
    });
    expect(endpoint.path).toBe("/knowledge-items/a%20b%2Fc");
  });

  it("returns a paramless template unchanged and carries its method", () => {
    expect(route("/health", "get")).toMatchObject({
      path: "/health",
      method: "GET",
    });
    expect(route("/search", "post")).toMatchObject({
      path: "/search",
      method: "POST",
    });
  });

  it("serializes declared query parameters", () => {
    const endpoint = route("/documents", "get", {
      query: { limit: "10", offset: "20" },
    });
    expect(endpoint.path).toBe("/documents?limit=10&offset=20");
  });

  it("skips undefined and null query values", () => {
    const endpoint = route("/documents", "get", {
      query: { limit: "10", status: undefined, category: null },
    });
    expect(endpoint.path).toBe("/documents?limit=10");
  });

  it("omits the ? when every query value is absent", () => {
    const endpoint = route("/documents", "get", {
      query: { limit: undefined },
    });
    expect(endpoint.path).toBe("/documents");
  });

  it("percent-encodes query values", () => {
    const endpoint = route("/documents", "get", {
      query: { category: "a b&c" },
    });
    expect(endpoint.path).toBe("/documents?category=a+b%26c");
  });

  it("throws when a declared parameter is missing at runtime", () => {
    expect(() =>
      route("/documents/{document_id}", "get", {
        params: { document_id: undefined as unknown as string },
      }),
    ).toThrow("Missing path parameter 'document_id'");
  });

  it("throws on a null parameter rather than sending 'null'", () => {
    expect(() =>
      route("/documents/{document_id}", "get", {
        params: { document_id: null as unknown as string },
      }),
    ).toThrow("Missing path parameter 'document_id'");
  });

  /* '..' would resolve /documents/../status to /status — a different
     endpoint entirely — so it must not survive interpolation. */
  it.each(["", ".", ".."])("rejects the dot-segment parameter %o", (value) => {
    expect(() =>
      route("/documents/{document_id}/status", "get", {
        params: { document_id: value },
      }),
    ).toThrow("must not be empty or a dot segment");
  });
});

/* Each body below is declared but never invoked — the compiler is the
   assertion. Calls are kept on one line so the formatter cannot move an
   error off the line its directive guards, and every call is given the
   right arity so an arity error cannot stand in for the error being
   asserted. */
const doc = "/documents/{document_id}";
const docParams = { params: { document_id: "a" } };

describe("route typing (compile-time)", () => {
  it("rejects invalid routes, methods, params and query keys", () => {
    const checks = () => {
      // @ts-expect-error — route not in the generated schema
      route("/helth", "get", docParams);
      // @ts-expect-error — the schema declares no POST on this route
      route(doc, "post", docParams);
      // @ts-expect-error — wrong path parameter name
      route(doc, "get", { params: { id: "a" } });
      // @ts-expect-error — a parameterized route needs its parameters
      route(doc, "get");
      // @ts-expect-error — query parameter not declared for this operation
      route("/documents", "get", { query: { nope: "1" } });
      // @ts-expect-error — this route declares no query parameters at all
      route("/health", "get", { query: { limit: "1" } });
    };
    expect(checks).toBeTypeOf("function");
  });
});

describe("request typing (compile-time)", () => {
  it("rejects targets that did not come from route()", () => {
    const checks = () => {
      // @ts-expect-error — a bare route template is not an Endpoint
      request("/health");
      // @ts-expect-error — a hand-interpolated path is not an Endpoint
      request("/documents/does-not-exist");
      // @ts-expect-error — a hand-built object cannot forge the brand
      request({ path: "/health", method: "GET" });
      // @ts-expect-error — the method travels with the endpoint, not init
      request(route("/health", "get"), { method: "DELETE" });
    };
    expect(checks).toBeTypeOf("function");
  });
});
