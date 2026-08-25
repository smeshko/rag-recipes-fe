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

  /* "New search" is a Link to bare "/" while the Cook row goes to
     lastSearchUrl(); they only look redundant. It sits OUTSIDE the nav
     landmark on purpose — it is an action, not a destination, and keeping the
     landmark to exactly three items is what the assertion above pins. */
  it("keeps New search out of the nav landmark", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation");
    expect(within(nav).queryByRole("link", { name: "New search" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "New search" }).length).toBe(2);
  });
});

/* The rail is one element serving both tiers: a static column at >=880px and a
   fixed off-canvas drawer below it. jsdom applies no CSS, so what is
   observable here is the state the styling keys off — the `max-[880px]:`
   visibility classes and aria-expanded — not the painted result. That is the
   right level anyway: the breakpoint behaviour belongs to the stylesheet, and
   these cases pin the toggle logic that drives it. */
describe("sidebar drawer", () => {
  /* The shelf fetches on mount on both / and /library — feed it, or the
     navigation case races an unhandled request. */
  beforeEach(() => server.use(...libraryShelfHandlers()));

  const rail = () => screen.getByRole("complementary", { name: "Sidebar" });
  const opener = () => screen.getByRole("button", { name: "Open sidebar" });

  it("starts closed", () => {
    renderAt("/");
    expect(rail().className).toContain("max-[880px]:invisible");
    expect(opener()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens from the header button and closes on Escape", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.click(opener());
    expect(rail().className).toContain("max-[880px]:visible");
    expect(opener()).toHaveAttribute("aria-expanded", "true");

    /* Bound on document, so it fires wherever focus sits — including the
       backdrop, which is deliberately not focusable. */
    await user.keyboard("{Escape}");
    expect(rail().className).toContain("max-[880px]:invisible");
  });

  it("closes when the rail's own close button is pressed", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(opener());

    await user.click(screen.getByRole("button", { name: "Close sidebar" }));

    expect(rail().className).toContain("max-[880px]:invisible");
  });

  /* Following a destination has to dismiss the drawer, or on a phone the new
     page lands underneath a panel that is still covering it. */
  it("closes when a destination is followed", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(opener());

    await user.click(screen.getByRole("link", { name: "Library" }));

    expect(rail().className).toContain("max-[880px]:invisible");
    expect(
      screen.getByRole("heading", { name: "On the shelf" }),
    ).toBeInTheDocument();
  });

  /* The lock is restored rather than cleared, so a host page that had its own
     overflow set gets it back. */
  it("locks and restores body scroll", async () => {
    const user = userEvent.setup();
    renderAt("/");
    expect(document.body.style.overflow).toBe("");

    await user.click(opener());
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
  });
});

describe("sidebar theme toggle", () => {
  /* The store is a module singleton and localStorage outlives a test, so the
     pin this block sets must not leak into the nav cases above. */
  afterEach(() => {
    localStorage.removeItem(THEME_KEY);
    resetThemeStoreForTests();
  });

  /* The control used to live in a top header banner. The re-skin moved every
     piece of global chrome into the rail, so the landmark it must be found in
     is the sidebar's `complementary` — <aside aria-label="Sidebar">. The
     remaining banner is drawer chrome, painted only below the 880px tier. */
  it("renders the theme radiogroup in the sidebar", () => {
    renderAt("/");
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    expect(
      within(sidebar).getByRole("radiogroup", { name: "Theme" }),
    ).toBeInTheDocument();
  });

  /* Node identity is the assertion, and it still matters with the entrance
     animation gone: the rail holds the drawer's open/closed state and the
     roving tabindex of this very control, so a remount on every theme change
     would drop focus mid-interaction. Nothing else proves it did not. */
  it("does not remount the sidebar when the theme changes", async () => {
    const user = userEvent.setup();
    renderAt("/");
    const before = screen.getByRole("complementary", { name: "Sidebar" });

    await user.click(within(before).getByRole("radio", { name: "Dark" }));

    expect(within(before).getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBe(before);
  });
});
