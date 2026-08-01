import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function currentPill(): string | null {
  const links = screen.getAllByRole("link");
  const current = links.find((l) => l.getAttribute("aria-current") === "page");
  return current?.textContent ?? null;
}

describe("shell nav active state", () => {
  /* The library shelf now fetches on mount — feed it whenever it renders. */
  beforeEach(() => server.use(...libraryShelfHandlers()));

  it.each([
    ["/", "Cook"],
    ["/?q=test", "Cook"],
    ["/recipes/abc", "Cook"],
    ["/library", "Library"],
    // The router ignores a trailing slash when matching; Nav must too.
    ["/library/", "Library"],
  ])("%s marks %s active", (path, pill) => {
    renderAt(path);
    expect(currentPill()).toBe(pill);
  });

  /* Nav must match what the router matches: these all fall through to the
     `*` route, so none of them may light a pill up. */
  it.each(["/nope", "/recipes", "/recipes-old", "/recipes/abc/extra"])(
    "%s is a not-found path and marks no pill active",
    (path) => {
      renderAt(path);
      expect(screen.getByTestId("notfound-page")).toBeInTheDocument();
      expect(currentPill()).toBeNull();
    },
  );

  it("never marks Add books active", () => {
    for (const path of ["/", "/library", "/recipes/abc", "/nope"]) {
      const { unmount } = renderAt(path);
      const addBooks = screen.getByRole("link", { name: "Add books" });
      expect(addBooks).not.toHaveAttribute("aria-current");
      unmount();
    }
  });

  it("navigates client-side when a pill is clicked", async () => {
    const user = userEvent.setup();
    renderAt("/");
    expect(screen.getByTestId("search-page")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Library" }));
    expect(
      screen.getByRole("heading", { name: "On the shelf" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("search-page")).not.toBeInTheDocument();
    expect(currentPill()).toBe("Library");
  });
});
