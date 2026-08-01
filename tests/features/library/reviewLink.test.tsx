import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { REVIEW_QUEUE_SEARCH_URL } from "../../../src/features/library/presentation";
import { routes } from "../../../src/routes";
import { groundedAnswerFixture } from "../../msw/answers";
import { libraryShelfHandlers, searchFixture } from "../../msw/handlers";
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

  it("keeps review=included in the URL across a mode-chip click", async () => {
    const user = userEvent.setup();
    const router = renderAt("/?q=scones&review=included");

    await user.click(screen.getByRole("button", { name: "Keyword only" }));

    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("mode")).toBe("keyword");
    expect(params.get("q")).toBe("scones");
    expect(params.get("review")).toBe("included");
  });
});

/* The half of the contract the URL cannot prove: an armed landing has to
   reach the backend as `filters.exclude_needs_review: false`, or the link
   navigates somewhere pretty and changes nothing. */
describe("review=included search request body", () => {
  const captureSearchBodies = () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post("/api/v1/search", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        return HttpResponse.json(searchFixture(String(body.query)));
      }),
    );
    return bodies;
  };

  it("arms the needs-review filter when the param is present", async () => {
    const bodies = captureSearchBodies();
    const user = userEvent.setup();
    renderAt("/?review=included");

    await user.type(screen.getByRole("textbox"), "scones{Enter}");

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      query: "scones",
      mode: "hybrid",
      filters: {
        item_type: "recipe",
        document_ids: [],
        exclude_needs_review: false,
      },
    });
  });

  it("sends the untouched default body without the param", async () => {
    const bodies = captureSearchBodies();
    const user = userEvent.setup();
    renderAt("/");

    await user.type(screen.getByRole("textbox"), "scones{Enter}");

    await waitFor(() => expect(bodies).toHaveLength(1));
    /* No `filters` key at all — the server default (exclude = true) stands. */
    expect(bodies[0]).toEqual({ query: "scones", mode: "hybrid" });
  });

  /* /answers runs its own retrieval under the same SearchFilters default, and
     its fallback results are rendered as a browse grid — so an unarmed answer
     on an armed landing can silently swap in a filtered result set. */
  it("arms the same filter on the /answers request", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post("/api/v1/answers", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(groundedAnswerFixture);
      }),
    );
    const user = userEvent.setup();
    renderAt("/?review=included");

    await user.type(screen.getByRole("textbox"), "scones");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      query: "scones",
      filters: {
        item_type: "recipe",
        document_ids: [],
        exclude_needs_review: false,
      },
    });
  });

  it("leaves the /answers body untouched without the param", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post("/api/v1/answers", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(groundedAnswerFixture);
      }),
    );
    const user = userEvent.setup();
    renderAt("/");

    await user.type(screen.getByRole("textbox"), "scones");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty("filters");
  });

  it("keeps the filter armed after a mode-chip click", async () => {
    const bodies = captureSearchBodies();
    const user = userEvent.setup();
    renderAt("/?q=scones&review=included");

    await waitFor(() => expect(bodies).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Vector only" }));

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({
      query: "scones",
      mode: "vector",
      filters: { exclude_needs_review: false },
    });
  });
});
