import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../src/routes";

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
  it("renders the search placeholder at /", () => {
    renderAt("/");
    expect(screen.getByTestId("search-page")).toBeInTheDocument();
  });

  it("shows the query from ?q= at /", () => {
    renderAt("/?q=test");
    expect(screen.getByTestId("search-query")).toHaveTextContent("test");
  });

  it("echoes the item id at /recipes/:id", () => {
    renderAt("/recipes/abc");
    expect(screen.getByTestId("recipe-page")).toHaveTextContent("abc");
  });

  it("renders the library placeholder at /library", () => {
    renderAt("/library");
    expect(screen.getByTestId("library-page")).toBeInTheDocument();
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

  it("renders the themed not-found on unknown paths", () => {
    renderAt("/nope");
    expect(screen.getByTestId("notfound-page")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to the kitchen/i }),
    ).toBeInTheDocument();
  });
});
