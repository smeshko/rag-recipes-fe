import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { reviewItemsFixture, reviewScenario } from "../src/mocks/review";
import { routes } from "../src/routes";
import { resetThemeStoreForTests, THEME_KEY } from "../src/ui/theme/themeStore";
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
  it("renders exactly the Cook, Favourites and Library pills in the nav", () => {
    for (const path of [
      "/",
      "/favourites",
      "/library",
      "/review",
      "/recipes/abc",
      "/nope",
    ]) {
      const { unmount } = renderAt(path);
      const nav = screen.getByRole("navigation");
      const pills = within(nav).getAllByRole("link");
      expect(pills.map((pill) => pill.textContent)).toEqual([
        "Cook",
        "Favourites",
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

describe("shell header theme toggle", () => {
  /* The store is a module singleton and localStorage outlives a test, so the
     pin this block sets must not leak into the nav cases above. */
  afterEach(() => {
    localStorage.removeItem(THEME_KEY);
    resetThemeStoreForTests();
  });

  it("renders the theme radiogroup in the header banner", () => {
    renderAt("/");
    const header = screen.getByRole("banner");
    expect(
      within(header).getByRole("radiogroup", { name: "Theme" }),
    ).toBeInTheDocument();
  });

  /* The bloom reveal is a CSS animation on the header element: if switching
     theme replaced that node, every header animation would re-run. Node
     identity is the assertion — nothing else proves it did not remount. */
  it("does not remount the header when the theme changes", async () => {
    const user = userEvent.setup();
    renderAt("/");
    const before = screen.getByRole("banner");

    await user.click(within(before).getByRole("radio", { name: "Dark" }));

    expect(within(before).getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.getByRole("banner")).toBe(before);
  });
});
