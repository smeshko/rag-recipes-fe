import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../../../src/routes";
import { server } from "../../../msw/server";

/* The edit page's states ladder (5.3 TASK-001). Every case renders through
   the real route table with createMemoryRouter — the idiom tests/recipe/* uses
   — because `/recipes/:id/edit` has to actually match, and because the form's
   later `useBlocker` needs a data router. */

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router };
}

describe("edit page ladder", () => {
  it("renders the form host for a needs_review item, narrow and unfooted", async () => {
    const { container, router } = renderAt("/recipes/item_review/edit");

    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /repair this extraction/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("Editing")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/recipes/item_review/edit");
    /* The catch-all did not swallow the path, and the handle resolved narrow. */
    expect(screen.queryByTestId("notfound-page")).not.toBeInTheDocument();
    const shell = container.querySelector("div.mx-auto");
    expect(shell?.className).toContain("max-w-[1020px]");
    expect(
      screen.queryByText(/grounded in your own books/),
    ).not.toBeInTheDocument();
  });

  it("shows the skeleton while the item is loading", async () => {
    server.use(
      http.get("/api/v1/knowledge-items/item_review", async () => {
        await delay(150);
        return HttpResponse.json({});
      }),
    );
    renderAt("/recipes/item_review/edit");

    expect(screen.getByTestId("edit-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-page")).not.toBeInTheDocument();
  });

  it("refuses a ready item with the already-on-the-shelf copy", async () => {
    renderAt("/recipes/item_full/edit");

    expect(
      await screen.findByText("This one's already on the shelf."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/only items that need review/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-page")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view the recipe/i }),
    ).toHaveAttribute("href", "/recipes/item_full");
  });

  it("refuses a superseded item with the generic copy, echoing the status", async () => {
    renderAt("/recipes/item_superseded/edit");

    expect(
      await screen.findByText("This item isn't waiting for review."),
    ).toBeInTheDocument();
    expect(screen.getByText("Superseded")).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-page")).not.toBeInTheDocument();
  });

  it("renders the calm not-found state for a missing item", async () => {
    /* Also the hook-order proof (D22): the ladder's early returns sit above
       RecipeEditForm, not above a hook call, so a rung that never reaches the
       form must not warn about a changed hook count. */
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    renderAt("/recipes/item_ghost/edit");

    expect(
      await screen.findByRole("heading", {
        name: "That page isn't on the shelf.",
      }),
    ).toBeInTheDocument();
    expect(document.querySelector(".bg-danger-fill")).toBeNull();
    expect(
      consoleError.mock.calls.some((call) => /hook/i.test(String(call[0]))),
    ).toBe(false);
    consoleError.mockRestore();
  });

  it("renders the danger error state and recovers on retry", async () => {
    server.use(
      http.get(
        "/api/v1/knowledge-items/item_review",
        () =>
          HttpResponse.json(
            {
              error: {
                code: "internal_error",
                message: "The stove hiccuped.",
                details: {},
              },
            },
            { status: 500 },
          ),
        { once: true },
      ),
    );
    const user = userEvent.setup();
    renderAt("/recipes/item_review/edit");

    expect(await screen.findByText("The stove hiccuped.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();
  });

  it("renders the not-a-recipe state for a non-recipe schema", async () => {
    /* Shape before status (D2): item_technique is `ready`, so both gates would
       fire — the wrong-shape one is the more informative dead end. */
    renderAt("/recipes/item_technique/edit");

    expect(
      await screen.findByRole("heading", { name: /isn't a recipe/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-page")).not.toBeInTheDocument();
    expect(
      screen.queryByText("This one's already on the shelf."),
    ).not.toBeInTheDocument();
  });

  it("leaves the read page untouched at /recipes/:id", async () => {
    renderAt("/recipes/item_review");

    expect(await screen.findByTestId("recipe-page")).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-page")).not.toBeInTheDocument();
  });
});
