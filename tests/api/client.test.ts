import { HttpResponse, http } from "msw";
import { ApiError, request, route } from "../../src/api";
import {
  documentNotFoundEnvelope,
  healthOk,
  unauthorizedEnvelope,
  unauthorizedHandler,
} from "../msw/handlers";
import { server } from "../msw/server";

const health = route("/health", "get");
const search = route("/search", "post");

describe("request", () => {
  it("returns parsed JSON on success", async () => {
    const body = await request<{ status: string }>(health);
    expect(body).toEqual(healthOk);
  });

  it("throws ApiError carrying the envelope on an error response", async () => {
    const err = (await request(
      route("/documents/{document_id}", "get", {
        params: { document_id: "does-not-exist" },
      }),
    ).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    const envelope = documentNotFoundEnvelope("does-not-exist");
    expect(err.code).toBe(envelope.error.code);
    expect(err.message).toBe(envelope.error.message);
    expect(err.details).toEqual(envelope.error.details);
    expect(err.status).toBe(404);
  });

  it("maps the 401 envelope fixture", async () => {
    server.use(unauthorizedHandler("/api/v1/health"));
    const err = await request(health).catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(unauthorizedEnvelope.error.code);
    expect((err as ApiError).status).toBe(401);
  });

  it("normalizes a non-envelope failure body to bad_response", async () => {
    server.use(
      http.get("/api/v1/health", () =>
        HttpResponse.text("<html>Bad Gateway</html>", { status: 502 }),
      ),
    );
    const err = await request(health).catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("bad_response");
    expect((err as ApiError).status).toBe(502);
  });

  it("normalizes a network failure to network_error", async () => {
    server.use(http.get("/api/v1/health", () => HttpResponse.error()));
    const err = await request(health).catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("network_error");
    expect((err as ApiError).status).toBeNull();
  });
});

/* RequestInit.headers has three legal shapes and all three must survive the
   merge with our default Accept — a Headers instance has no own enumerable
   properties and a tuple array spreads to index keys, so object spread
   silently drops both. */
describe("request header merging", () => {
  type Echo = { accept: string | null; contentType: string | null };

  /* /search is a real schema route (POST), so the typed surface accepts it
     while the handler just echoes back what the client actually sent. */
  const echoHandler = http.post("/api/v1/search", ({ request: req }) =>
    HttpResponse.json({
      accept: req.headers.get("accept"),
      contentType: req.headers.get("content-type"),
    }),
  );

  const echo = (headers: HeadersInit) => {
    server.use(echoHandler);
    return request<Echo>(search, { headers });
  };

  it("preserves a plain object", async () => {
    const body = await echo({ "Content-Type": "application/json" });
    expect(body.contentType).toBe("application/json");
    expect(body.accept).toBe("application/json");
  });

  it("preserves a Headers instance", async () => {
    const body = await echo(
      new Headers({ "Content-Type": "application/json" }),
    );
    expect(body.contentType).toBe("application/json");
    expect(body.accept).toBe("application/json");
  });

  it("preserves a tuple array", async () => {
    const body = await echo([["Content-Type", "application/json"]]);
    expect(body.contentType).toBe("application/json");
    expect(body.accept).toBe("application/json");
  });

  it("lets a caller-supplied Accept win over the default", async () => {
    const body = await echo({ Accept: "text/plain" });
    expect(body.accept).toBe("text/plain");
  });

  it("sends the default Accept when no headers are passed", async () => {
    server.use(echoHandler);
    const body = await request<Echo>(search);
    expect(body.accept).toBe("application/json");
  });
});
