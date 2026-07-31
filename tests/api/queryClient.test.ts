import { ApiError, shouldRetry } from "../../src/api";

describe("shouldRetry", () => {
  const envelope = (status: number | null) =>
    new ApiError("some_code", "message", {}, status);

  it("never retries a 4xx ApiError", () => {
    expect(shouldRetry(0, envelope(401))).toBe(false);
    expect(shouldRetry(0, envelope(404))).toBe(false);
    expect(shouldRetry(1, envelope(422))).toBe(false);
  });

  it("retries a 5xx ApiError at most twice", () => {
    expect(shouldRetry(0, envelope(502))).toBe(true);
    expect(shouldRetry(1, envelope(502))).toBe(true);
    expect(shouldRetry(2, envelope(502))).toBe(false);
  });

  it("retries a network error (status null) at most twice", () => {
    const network = new ApiError("network_error", "gone", {}, null);
    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(1, network)).toBe(true);
    expect(shouldRetry(2, network)).toBe(false);
  });

  it("retries non-ApiError failures at most twice", () => {
    expect(shouldRetry(0, new Error("boom"))).toBe(true);
    expect(shouldRetry(2, new Error("boom"))).toBe(false);
  });
});
