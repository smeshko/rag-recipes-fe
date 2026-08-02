import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { reviewItemsFixture, reviewScenario } from "../src/mocks/review";
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
  /* The library shelf and the review queue both fetch on mount — feed them
     whenever they render. */
  beforeEach(() =>
    server.use(
      ...libraryShelfHandlers(),
      ...reviewScenario(reviewItemsFixture),
    ),
  );

  it.each([
    ["/", "Cook"],
    ["/?q=test", "Cook"],
    ["/recipes/abc", "Cook"],
    ["/library", "Library"],
    // The router ignores a trailing slash when matching; Nav must too.
    ["/library/", "Library"],
    /* The queue belongs to the shelf — it lights Library, filter or not. */
    ["/review", "Library"],
    ["/review?document=d1", "Library"],
    /* The recipe leaf is shared by every section, so its pill comes from the
       return target rather than being pinned to Cook. */
    ["/recipes/abc?from=%2Freview%3Fdocument%3Dd1", "Library"],
    ["/recipes/abc?from=%2Flibrary", "Library"],
    ["/recipes/abc?from=%2F%3Fq%3Dscones", "Cook"],
    /* A rejected target degrades to exactly the no-target pill. */
    ["/recipes/abc?from=%2Fnope", "Cook"],
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

  /* Scoped with within(): on /library the shelf fixtures legitimately render
     their own links (e.g. "Open review queue →"), so a document-wide query
     would overcount. */
  it("renders exactly the Cook and Library pills in the nav", () => {
    for (const path of ["/", "/library", "/review", "/recipes/abc", "/nope"]) {
      const { unmount } = renderAt(path);
      const nav = screen.getByRole("navigation");
      const pills = within(nav).getAllByRole("link");
      expect(pills.map((pill) => pill.textContent)).toEqual([
        "Cook",
        "Library",
      ]);
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
