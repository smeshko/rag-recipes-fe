import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";
import { fullItemFixture, sparseItemFixture } from "../msw/knowledgeItems";
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

describe("recipe failure states", () => {
  it("renders the calm not-found state on knowledge_item_not_found", async () => {
    const router = renderAt("/recipes/item_ghost");
    expect(
      await screen.findByRole("heading", {
        name: "That page isn't on the shelf.",
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/recipes/item_ghost");
    expect(document.querySelector(".bg-danger-soft")).toBeNull();
    /* The crumb and the state body both offer the way home. */
    expect(
      screen.getAllByRole("link", { name: /back to cook/i }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders the danger error state and recovers on retry", async () => {
    let requests = 0;
    server.use(
      http.get(
        "/api/v1/knowledge-items/item_full",
        () => {
          requests += 1;
          return HttpResponse.json(
            {
              error: {
                code: "internal_error",
                message: "The stove hiccuped.",
                details: {},
              },
            },
            { status: 500 },
          );
        },
        { once: true },
      ),
    );
    const user = userEvent.setup();
    renderAt("/recipes/item_full");
    expect(await screen.findByText("The stove hiccuped.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(
      await screen.findByRole("heading", {
        name: fullItemFixture.display.title,
      }),
    ).toBeInTheDocument();
    expect(requests).toBe(1);
  });

  it("renders the not-a-recipe state for a non-recipe schema", async () => {
    renderAt("/recipes/item_technique");
    expect(
      await screen.findByRole("heading", { name: /isn't a recipe/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ingredients" })).toBeNull();
  });
});

describe("provenance", () => {
  it("renders schema, confidence and span count from the full fixture", async () => {
    renderAt("/recipes/item_full");
    await screen.findByRole("heading", { name: fullItemFixture.display.title });
    expect(await screen.findByText("recipe.v1")).toBeInTheDocument();
    expect(screen.getByText("0.98")).toBeInTheDocument();
    expect(screen.getByText("1 of 1 spans")).toBeInTheDocument();
    expect(screen.getByText(/Extracted from/)).toBeInTheDocument();
  });

  /* The footer attributes; it never guarantees fidelity. The renderer itself
     trims, orders and renumbers, so any such claim would be falsifiable. */
  it.each([
    ["a warned item", "/recipes/item_warned"],
    ["an unwarned item", "/recipes/item_full"],
    ["a sparse item rendered from text fallbacks", "/recipes/item_sparse"],
    ["an item whose steps were renumbered", "/recipes/item_mixednum"],
  ])("makes no fidelity claim for %s", async (_label, path) => {
    renderAt(path);
    await screen.findByText(/Extracted/);
    expect(screen.queryByText(/was invented/)).toBeNull();
    expect(screen.queryByText(/inferred/)).toBeNull();
    expect(screen.queryByText(/wording is preserved/)).toBeNull();
    expect(screen.queryByText(/nothing here was rewritten/)).toBeNull();
    expect(screen.queryByText(/exactly as extracted/)).toBeNull();
  });

  it("omits confidence for the sparse fixture", async () => {
    renderAt("/recipes/item_sparse");
    await screen.findByRole("heading", {
      name: sparseItemFixture.display.title,
    });
    await waitFor(() =>
      expect(screen.getByText(/Extracted/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/^confidence$/)).toBeNull();
  });
});
