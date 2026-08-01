import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { LAST_SEARCH_KEY } from "../../src/features/search/lastSearch";
import { routes } from "../../src/routes";
import { searchFixture } from "../msw/handlers";
import { server } from "../msw/server";

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

const cookPill = () => screen.getByRole("link", { name: "Cook" });

const storedLastSearch = () => {
  const raw = sessionStorage.getItem(LAST_SEARCH_KEY);
  return raw === null ? null : JSON.parse(raw);
};

/* sessionStorage outlives each jsdom render — scrub it so no test inherits
   another test's "last search". */
beforeEach(() => sessionStorage.clear());

describe("last-search persistence (storage writes)", () => {
  it("submitting a search stores {q, mode, reviewIncluded}", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.type(searchBox(), "scones");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(storedLastSearch()).toEqual({
        q: "scones",
        mode: "hybrid",
        reviewIncluded: false,
      }),
    );
  });

  it("a submit with the review filter armed stores reviewIncluded: true", async () => {
    const user = userEvent.setup();
    renderAt("/?review=included");
    await user.type(searchBox(), "muffins");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(storedLastSearch()).toEqual({
        q: "muffins",
        mode: "hybrid",
        reviewIncluded: true,
      }),
    );
  });

  it("committing an emptied query removes the key", async () => {
    const user = userEvent.setup();
    renderAt("/?q=frittata");
    await user.clear(searchBox());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(storedLastSearch()).toBeNull());
  });
});

describe("Cook pill restore", () => {
  it("carries the stored q from /library", async () => {
    sessionStorage.setItem(
      LAST_SEARCH_KEY,
      JSON.stringify({ q: "frittata", mode: "hybrid", reviewIncluded: false }),
    );
    renderAt("/library");
    expect(cookPill()).toHaveAttribute("href", "/?q=frittata");
  });

  it("carries a non-hybrid mode", async () => {
    sessionStorage.setItem(
      LAST_SEARCH_KEY,
      JSON.stringify({ q: "frittata", mode: "vector", reviewIncluded: false }),
    );
    renderAt("/library");
    expect(cookPill()).toHaveAttribute("href", "/?q=frittata&mode=vector");
  });

  it("carries review=included when the stored search was armed", async () => {
    sessionStorage.setItem(
      LAST_SEARCH_KEY,
      JSON.stringify({ q: "frittata", mode: "hybrid", reviewIncluded: true }),
    );
    renderAt("/library");
    expect(cookPill()).toHaveAttribute("href", "/?q=frittata&review=included");
  });

  it("is bare / when nothing is stored (fresh session)", async () => {
    renderAt("/library");
    expect(cookPill()).toHaveAttribute("href", "/");
  });
});

describe("return to Cook within staleTime", () => {
  it("Search → Library → Cook re-shows the results without a second /search", async () => {
    const bodies = captureSearchBodies();
    const user = userEvent.setup();
    renderAt("/");
    /* Commit through the box — only writeParams commits are remembered;
       a deep-loaded ?q= deliberately is not (restore rides the pill only). */
    await user.type(searchBox(), "frittata");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(bodies).toHaveLength(1));
    await screen.findByText("Spinach & Cheddar Frittata");

    await user.click(screen.getByRole("link", { name: "Library" }));
    await screen.findByText(/The shelf,/);

    /* The pill carries the remembered URL, so this click IS the restore. */
    await user.click(cookPill());
    await screen.findByText("Spinach & Cheddar Frittata");
    expect(searchBox()).toHaveValue("frittata");

    /* Fresh-within-staleTime: the remount must not buy a second request. */
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bodies).toHaveLength(1);
  });
});
