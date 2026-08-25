import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";
import { answersHandler, groundedAnswerFixture } from "../msw/answers";
import {
  composedMenuFixture,
  fallbackMenuFixture,
  MENU_FALLBACK_WARNING,
  menusHandler,
} from "../msw/menus";
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

let calls: { path: string; body: unknown }[] = [];

beforeEach(() => {
  calls = [];
  server.events.on("request:start", async ({ request }) => {
    const path = new URL(request.url).pathname;
    if (
      request.method === "POST" &&
      (path === "/api/v1/menus" || path === "/api/v1/answers")
    ) {
      calls.push({ path, body: await request.clone().json() });
    }
  });
});

afterEach(() => {
  server.events.removeAllListeners();
});

const searchBox = () =>
  screen.getByRole("textbox", { name: "What are we cooking?" });
const menuButton = () => screen.getByRole("button", { name: "Compose a menu" });
const askButton = () => screen.getByRole("button", { name: "Ask the shelf" });

describe("compose a menu", () => {
  it("never fires on load, even with ?menu=1 in the URL", async () => {
    server.use(menusHandler(composedMenuFixture));
    renderAt("/?q=summer+dinner&menu=1");
    await waitFor(() => expect(menuButton()).toBeEnabled());
    expect(calls).toHaveLength(0);
    expect(screen.queryByTestId("menu-card")).toBeNull();
  });

  it("posts the draft once, commits ?menu=1, and renders the courses", async () => {
    server.use(menusHandler(composedMenuFixture));
    const user = userEvent.setup();
    const router = renderAt("/");
    await user.type(searchBox(), "a light summer dinner for four");
    const button = menuButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.path).toBe("/api/v1/menus");
    expect(calls[0]?.body).toEqual({
      query: "a light summer dinner for four",
      retrieval: { mode: "hybrid" },
      menu: { include_candidates: false },
    });
    expect(router.state.location.search).toBe(
      "?q=a+light+summer+dinner+for+four&menu=1",
    );

    const card = await screen.findByTestId("menu-card");
    expect(
      within(card).getByText(/A menu from your books · 3 of 4 courses/),
    ).toBeInTheDocument();
    expect(
      within(card).getByText("A Summer Evening on the Grill"),
    ).toBeInTheDocument();
    /* Prose renders through the answer parser: no literal ** or [cite_. */
    expect(card.textContent).not.toContain("**");
    expect(card.textContent).not.toContain("[cite_");

    const courses = within(card).getByText("The courses")
      .parentElement as HTMLElement;
    const links = within(courses).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Grilled Gazpacho"),
      expect.stringContaining("Ratatouille"),
      expect.stringContaining("Baked Apples"),
    ]);
    expect(links[0]?.getAttribute("href")).toBe(
      "/recipes/item_gazpacho?from=%2F%3Fq%3Da%2Blight%2Bsummer%2Bdinner%2Bfor%2Bfour%26menu%3D1",
    );
    /* The unfillable course is reported, not dropped. */
    expect(
      within(courses).getByText("Nothing on the shelf fits this course."),
    ).toBeInTheDocument();
  });

  it("renders a fallback menu as content with the warning inline", async () => {
    server.use(menusHandler(fallbackMenuFixture));
    const user = userEvent.setup();
    renderAt("/?q=summer+dinner");
    await user.click(menuButton());
    const card = await screen.findByTestId("menu-card");
    expect(within(card).getByRole("status")).toHaveTextContent(
      MENU_FALLBACK_WARNING,
    );
    expect(within(card).getAllByRole("link").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("arming a menu replaces an answer on the same question, and back again", async () => {
    server.use(
      answersHandler(groundedAnswerFixture),
      menusHandler(composedMenuFixture),
    );
    const user = userEvent.setup();
    const router = renderAt("/?q=breakfast");
    await user.click(askButton());
    await screen.findByText(/Grounded in your books/);
    expect(router.state.location.search).toBe("?q=breakfast&asked=1");

    await user.click(menuButton());
    await screen.findByTestId("menu-card");
    expect(router.state.location.search).toBe("?q=breakfast&menu=1");
    expect(screen.queryByText(/Grounded in your books/)).toBeNull();

    await user.click(askButton());
    await screen.findByText(/Grounded in your books/);
    expect(router.state.location.search).toBe("?q=breakfast&asked=1");
    expect(screen.queryByTestId("menu-card")).toBeNull();
  });
});
