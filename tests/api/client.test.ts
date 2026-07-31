import { HttpResponse, http } from "msw";
import { ApiError, request } from "../../src/api";
import {
  documentNotFoundEnvelope,
  healthOk,
  unauthorizedEnvelope,
  unauthorizedHandler,
} from "../msw/handlers";
import { server } from "../msw/server";

describe("request", () => {
  it("returns parsed JSON on success", async () => {
    const body = await request<{ status: string }>("/health");
    expect(body).toEqual(healthOk);
  });

  it("throws ApiError carrying the envelope on an error response", async () => {
    const err = (await request("/documents/does-not-exist").catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    const envelope = documentNotFoundEnvelope("does-not-exist");
    expect(err.code).toBe(envelope.error.code);
    expect(err.message).toBe(envelope.error.message);
    expect(err.details).toEqual(envelope.error.details);
    expect(err.status).toBe(404);
  });

  it("maps the 401 envelope fixture", async () => {
    server.use(unauthorizedHandler("/api/v1/health"));
    const err = await request("/health").catch((e: unknown) => e as ApiError);
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
    const err = await request("/health").catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("bad_response");
    expect((err as ApiError).status).toBe(502);
  });

  it("normalizes a network failure to network_error", async () => {
    server.use(http.get("/api/v1/health", () => HttpResponse.error()));
    const err = await request("/health").catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("network_error");
    expect((err as ApiError).status).toBeNull();
  });
});
