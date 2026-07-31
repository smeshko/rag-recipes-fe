import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { REVIEW_QUEUE_SEARCH_URL } from "../../../src/features/library/presentation";
import { routes } from "../../../src/routes";
import { libraryShelfHandlers } from "../../msw/handlers";
import { server } from "../../msw/server";

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const bookRow = async (title: string) => {
  const heading = await screen.findByRole("heading", { name: title });
  const article = heading.closest("article");
  if (!article) throw new Error(`no <article> around '${title}'`);
  return within(article);
};

const LINK_NAME = /open review queue/i;

describe("review queue link-out", () => {
  beforeEach(() => server.use(...libraryShelfHandlers()));

  it("renders on both books with review items, with the exact href", async () => {
    renderAt("/library");

    /* The needs_review book (14 items) AND the ready book with 1 item. */
    for (const title of [
      "Baking with Less Sugar",
      "One Pan to Rule Them All",
    ]) {
      const row = await bookRow(title);
      const link = await row.findByRole("link", { name: LINK_NAME });
      expect(link).toHaveAttribute("href", REVIEW_QUEUE_SEARCH_URL);
      expect(REVIEW_QUEUE_SEARCH_URL).toBe("/?review=included");
    }
  });

  it("is absent on every book with zero review items", async () => {
    renderAt("/library");

    for (const title of [
      "Eat Drink Paleo",
      "The Green Roasting Tin",
      "modernist-bread-vol2.pdf",
    ]) {
      const row = await bookRow(title);
      /* Wait for details to settle so a late-arriving link cannot slip by. */
      await screen.findByText(/3 books ready/);
      expect(row.queryByRole("link", { name: LINK_NAME })).toBeNull();
    }
  });

  it("navigates in-app to the search landing with the filter armed", async () => {
    const user = userEvent.setup();
    const router = renderAt("/library");

    const baking = await bookRow("Baking with Less Sugar");
    await user.click(baking.getByRole("link", { name: LINK_NAME }));

    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toBe("?review=included");
    /* The search screen renders — armed, not searching (no q). */
    expect(screen.getByTestId("search-page")).toBeInTheDocument();
  });

  it("keeps review=included in the URL across a search submit", async () => {
    const user = userEvent.setup();
    const router = renderAt("/?review=included");

    await user.type(screen.getByRole("textbox"), "scones{Enter}");

    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("q")).toBe("scones");
    expect(params.get("review")).toBe("included");
  });
});
