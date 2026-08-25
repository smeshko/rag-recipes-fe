import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";
import { fixtureReadyRecipes, searchFixture } from "../msw/handlers";
import { server } from "../msw/server";
import { chooseMode, currentMode, runAiAction } from "./composer";

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** Capture every body POSTed to /api/v1/search. */
function captureSearchBodies() {
  const bodies: unknown[] = [];
  server.use(
    http.post("/api/v1/search", async ({ request }) => {
      const body = (await request.json()) as { query: string };
      bodies.push(body);
      return Response.json(searchFixture(body.query));
    }),
  );
  return bodies;
}

const searchBox = () =>
  screen.getByRole("textbox", { name: "What are we cooking?" });

describe("SearchPage URL ↔ state", () => {
  it("fires exactly one hybrid search from ?q= on load", async () => {
    const bodies = captureSearchBodies();
    renderAt("/?q=frittata");
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ query: "frittata", mode: "hybrid" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bodies).toHaveLength(1);
  });

  it("fires no search on the bare /", async () => {
    const bodies = captureSearchBodies();
    renderAt("/");
    /* Shelf stats still legitimately hit /documents — only search matters. */
    await waitFor(() =>
      expect(screen.getByText(/3 cookbooks on the shelf/)).toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(0);
  });

  it("typing + Ask writes ?q= and the arming param, nothing else", async () => {
    /* No ?mode= for hybrid (D1); `asked=1` because Ask is what arms the
       entry — those two params and no others. */
    const user = userEvent.setup();
    const router = renderAt("/");
    await user.type(searchBox(), "scones");
    await runAiAction(user, "Ask the shelf");
    await waitFor(() =>
      expect(router.state.location.search).toBe("?q=scones&asked=1"),
    );
  });

  it("chip click writes ?mode= preserving q, and re-queries with it", async () => {
    const bodies = captureSearchBodies();
    const user = userEvent.setup();
    const router = renderAt("/?q=frittata");
    await waitFor(() => expect(bodies).toHaveLength(1));
    await chooseMode(user, "Vector only");
    await waitFor(() =>
      expect(router.state.location.search).toBe("?q=frittata&mode=vector"),
    );
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ query: "frittata", mode: "vector" });
  });

  it("selecting Hybrid clears ?mode=", async () => {
    const user = userEvent.setup();
    const router = renderAt("/?q=frittata&mode=vector");
    await chooseMode(user, "Hybrid");
    await waitFor(() =>
      expect(router.state.location.search).toBe("?q=frittata"),
    );
  });

  it("deep-loaded ?mode=vector restores the active chip", async () => {
    renderAt("/?q=frittata&mode=vector");
    /* The three chips became one menu, so "which is active" is no longer an
       aria-pressed on a visible button — it is what the closed trigger
       reports, which is also the only thing a reader can see without
       opening it. */
    expect(currentMode()).toBe("Vector only");
  });

  it("?mode=garbage falls back to Hybrid and never reaches the API", async () => {
    const bodies = captureSearchBodies();
    renderAt("/?q=frittata&mode=garbage");
    expect(currentMode()).toBe("Hybrid");
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ query: "frittata", mode: "hybrid" });
  });

  it("back navigation resyncs the search box", async () => {
    const user = userEvent.setup();
    const router = renderAt("/?q=alpha");
    await user.clear(searchBox());
    await user.type(searchBox(), "beta");
    await runAiAction(user, "Ask the shelf");
    await waitFor(() =>
      expect(router.state.location.search).toBe("?q=beta&asked=1"),
    );
    await router.navigate(-1);
    await waitFor(() => expect(searchBox()).toHaveValue("alpha"));
  });

  it("hero renders the fixture shelf stats", async () => {
    renderAt("/");
    await waitFor(() =>
      expect(
        screen.getByText(
          new RegExp(
            `3 cookbooks on the shelf · ${fixtureReadyRecipes} recipes ready`,
          ),
        ),
      ).toBeInTheDocument(),
    );
  });

  it("says stats are unavailable when the shelf list fails terminally", async () => {
    server.use(
      http.get("/api/v1/documents", () =>
        HttpResponse.json(
          { error: { code: "unauthorized", message: "nope", details: {} } },
          { status: 401 },
        ),
      ),
    );
    renderAt("/");
    /* Never "warming up the shelf…" — that request is not coming back. */
    expect(
      await screen.findByText("shelf stats unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/warming up the shelf/)).toBeNull();
  });

  it("marks the hero total as a floor when a book's counts fail", async () => {
    server.use(
      http.get("/api/v1/documents/doc_baking", () =>
        HttpResponse.json(
          { error: { code: "document_not_found" } },
          {
            status: 404,
          },
        ),
      ),
    );
    renderAt("/");
    /* "212+", never a bare "212" — the third book never reported, so the
       exact figure is unknown and the hero must not claim it. */
    await waitFor(() =>
      expect(
        screen.getByText(/3 cookbooks on the shelf · 212\+ recipes ready/),
      ).toBeInTheDocument(),
    );
  });
});
