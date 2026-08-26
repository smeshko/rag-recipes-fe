import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { reviewItemsFixture, reviewScenario } from "../src/mocks/review";
import { routes } from "../src/routes";
import { SIDEBAR_KEY } from "../src/ui/sidebarPreference";
import { resetThemeStoreForTests, THEME_KEY } from "../src/ui/theme/themeStore";
import { resetCompactViewportForTests } from "../src/ui/useCompactViewport";
import { installMatchMedia, type MatchMediaHandle } from "./matchMedia";
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

  /* The rail used to carry a "New search" action above the destinations,
     pointing at bare "/" while the Cook row pointed at the last committed
     search. Two rows, both spelled as places, and nothing on screen saying
     which one cleared the box. The wordmark carries "fresh" now — a brand that
     goes home is a convention rather than a thing to be read — which leaves
     the Cook row free to mean exactly one thing: resume.

     tests/search/lastSearch.tsx pins the resume target itself; what this pins
     is that there is no THIRD way to reach the composer. */
  it("splits fresh and resumed between the wordmark and the Cook row", () => {
    sessionStorage.setItem("sk:last-search", "/?q=frittata");
    renderAt("/library");

    expect(screen.queryByRole("link", { name: "New search" })).toBeNull();
    expect(screen.getByRole("link", { name: "Stove" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Cook" })).toHaveAttribute(
      "href",
      "/?q=frittata",
    );
    sessionStorage.clear();
  });
});

/* The rail is one element serving both tiers, and it is collapsible on both.
   Which tier it is on is a JS read now (useCompactViewport) rather than a
   `max-[880px]:` class alone, because the two collapses behave differently —
   so these blocks install the matchMedia the hook reads and assert the state
   the styling keys off. jsdom applies no CSS: what is observable here is the
   class string and the aria, not the painted result. */
const rail = () => screen.getByRole("complementary", { name: "Sidebar" });
const opener = () => screen.getByRole("button", { name: "Open sidebar" });
const collapser = () => screen.getByRole("button", { name: "Close sidebar" });

describe("sidebar column (wide viewport)", () => {
  beforeEach(() => server.use(...libraryShelfHandlers()));
  /* The preference outlives a render — scrub it so no case inherits another's
     collapsed rail. */
  afterEach(() => localStorage.removeItem(SIDEBAR_KEY));

  it("starts expanded, with no top bar to reopen from", () => {
    renderAt("/");
    expect(rail().className).toContain("w-[260px]");
    expect(collapser()).toHaveAttribute("aria-expanded", "true");
    /* The bar exists only to carry the way back in. */
    expect(screen.queryByRole("button", { name: "Open sidebar" })).toBeNull();
  });

  it("collapses to zero width and reopens from the bar that appears", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.click(collapser());
    expect(rail().className).toContain("w-0");
    /* invisible, not merely clipped: a zero-width rail is still tabbable. */
    expect(rail().className).toContain("invisible");
    expect(opener()).toHaveAttribute("aria-expanded", "false");

    await user.click(opener());
    expect(rail().className).toContain("w-[260px]");
    expect(screen.queryByRole("button", { name: "Open sidebar" })).toBeNull();
  });

  /* It is a column, not an overlay: nothing is dimmed, nothing is trapped, and
     the page behind it keeps its scroll. That is the whole difference between
     this block and the drawer one below. */
  it("dims nothing and locks nothing", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(collapser());
    await user.click(opener());
    expect(document.body.style.overflow).toBe("");
  });

  /* A drawer has to dismiss itself on navigation because it covers the page it
     just left. A column does not, and collapsing on every click would be a
     rail that fights the reader. */
  it("stays open when a destination is followed", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("link", { name: "Library" }));
    expect(
      screen.getByRole("heading", { name: "On the shelf" }),
    ).toBeInTheDocument();
    expect(rail().className).toContain("w-[260px]");
  });

  it("remembers a collapsed rail across a reload", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt("/");
    await user.click(collapser());
    unmount();

    renderAt("/");
    expect(rail().className).toContain("w-0");
    expect(opener()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("sidebar drawer (narrow viewport)", () => {
  let media: MatchMediaHandle;

  beforeEach(() => {
    /* The suite-wide fake answers every query with one flag, so this reports a
       narrow viewport AND a dark OS. Only the first matters here. */
    media = installMatchMedia(true);
    resetCompactViewportForTests();
    server.use(...libraryShelfHandlers());
  });
  afterEach(() => {
    media.restore();
    resetCompactViewportForTests();
    resetThemeStoreForTests();
  });

  it("starts closed however the column preference was left", () => {
    localStorage.setItem(SIDEBAR_KEY, "expanded");
    renderAt("/");
    expect(rail().className).toContain("invisible");
    expect(opener()).toHaveAttribute("aria-expanded", "false");
    localStorage.removeItem(SIDEBAR_KEY);
  });

  it("opens from the header button and closes on Escape", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.click(opener());
    expect(rail().className).toContain("translate-x-0");
    expect(opener()).toHaveAttribute("aria-expanded", "true");

    /* Bound on document, so it fires wherever focus sits — including the
       backdrop, which is deliberately not focusable. */
    await user.keyboard("{Escape}");
    expect(rail().className).toContain("-translate-x-full");
  });

  it("closes when the rail's own toggle is pressed", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(opener());

    await user.click(collapser());

    expect(rail().className).toContain("-translate-x-full");
  });

  /* Following a destination has to dismiss the drawer, or on a phone the new
     page lands underneath a panel that is still covering it. */
  it("closes when a destination is followed", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(opener());

    await user.click(screen.getByRole("link", { name: "Library" }));

    expect(rail().className).toContain("-translate-x-full");
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
