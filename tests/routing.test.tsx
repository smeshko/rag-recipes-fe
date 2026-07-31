import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../src/routes";

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
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

  it("renders the themed not-found on unknown paths", () => {
    renderAt("/nope");
    expect(screen.getByTestId("notfound-page")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to the kitchen/i }),
    ).toBeInTheDocument();
  });
});
