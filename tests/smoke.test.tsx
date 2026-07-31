import { render, screen } from "@testing-library/react";
import {
  documentNotFoundEnvelope,
  healthOk,
  unauthorizedEnvelope,
  unauthorizedHandler,
} from "./msw/handlers";
import { server } from "./msw/server";

function Probe() {
  return <p>harness alive</p>;
}

describe("test harness", () => {
  it("renders through react-testing-library", () => {
    render(<Probe />);
    expect(screen.getByText("harness alive")).toBeInTheDocument();
  });

  it("serves the health success fixture through msw", async () => {
    const res = await fetch("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(healthOk);
  });

  it("serves the error envelope fixture through msw", async () => {
    const res = await fetch("/api/v1/documents/does-not-exist");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(
      documentNotFoundEnvelope("does-not-exist"),
    );
  });

  it("serves the 401 envelope via a per-test override", async () => {
    server.use(unauthorizedHandler("/api/v1/health"));
    const res = await fetch("/api/v1/health");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(unauthorizedEnvelope);
  });

  it("fails unmatched requests instead of reaching the real backend", async () => {
    await expect(fetch("/api/v1/definitely-not-handled")).rejects.toThrow();
  });
});
