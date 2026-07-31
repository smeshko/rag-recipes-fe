import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../src/routes";
import { libraryShelfHandlers } from "./msw/handlers";
import { server } from "./msw/server";

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

describe("routing", () => {
  it("renders the search screen at /", () => {
    renderAt("/");
    expect(screen.getByTestId("search-page")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "What are we cooking?" }),
    ).toBeInTheDocument();
  });

  it("restores the query from ?q= into the search box", () => {
    renderAt("/?q=test");
    expect(
      screen.getByRole("textbox", { name: "What are we cooking?" }),
    ).toHaveValue("test");
  });

  it("renders the item title at /recipes/:id", async () => {
    renderAt("/recipes/item_full");
    expect(
      await screen.findByRole("heading", {
        name: "Spinach and Cheddar Frittata",
      }),
    ).toBeInTheDocument();
  });

  it("renders the library shelf at /library", async () => {
    server.use(...libraryShelfHandlers());
    renderAt("/library");
    expect(
      screen.getByRole("heading", { name: "On the shelf" }),
    ).toBeInTheDocument();
    /* Let the shelf queries settle inside the test. */
    expect(
      await screen.findByRole("heading", { name: "One Pan to Rule Them All" }),
    ).toBeInTheDocument();
  });

  /* The field is seeded from the URL, so history navigation must reseed it —
     otherwise the heading and the textbox disagree about what was searched. */
  it("restores the search field when the URL changes under it", async () => {
    const user = userEvent.setup();
    const { router } = renderAt("/");
    const field = () => screen.getByRole("textbox");

    await user.type(field(), "scones{Enter}");
    expect(field()).toHaveValue("scones");

    await user.clear(field());
    await user.type(field(), "frittata{Enter}");
    expect(field()).toHaveValue("frittata");

    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe("?q=scones");
    expect(field()).toHaveValue("scones");
  });

  /* Reseeding must not remount the field: a keyboard user refining a query
     would otherwise be dropped back to the document after every submit. */
  it("keeps focus in the search field after submitting", async () => {
    const user = userEvent.setup();
    renderAt("/");
    const field = () => screen.getByRole("textbox");

    await user.type(field(), "scones{Enter}");

    expect(field()).toHaveValue("scones");
    expect(field()).toHaveFocus();
  });

  it("renders the themed not-found on unknown paths", () => {
    renderAt("/nope");
    expect(screen.getByTestId("notfound-page")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to the kitchen/i }),
    ).toBeInTheDocument();
  });
});
