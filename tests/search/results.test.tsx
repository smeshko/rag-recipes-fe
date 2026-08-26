import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { accentFor } from "../../src/features/search/accent";
import { routes } from "../../src/routes";
import {
  emptySearchHandler,
  searchErrorHandler,
  searchFixture,
} from "../msw/handlers";
import { server } from "../msw/server";
import { runWithMode } from "./composer";

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

const fixture = searchFixture("frittata");
const [first, second] = fixture.results;

describe("results grid", () => {
  it("renders every card field byte-equal to the fixture projection", async () => {
    renderAt("/?q=frittata");
    const title = await screen.findByText(first.item.title);
    const card = title.closest("article");
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    expect(scope.getByText(first.document.title)).toBeInTheDocument();
    expect(
      scope.getByText(first.source_citations[0]?.label as string),
    ).toBeInTheDocument();
    expect(
      scope.getByText(first.display.snippet as string),
    ).toBeInTheDocument();
    expect(
      scope.getByText(
        first.structured_preview?.top_ingredients.join(" · ") as string,
      ),
    ).toBeInTheDocument();
    /* One line, dot-joined — badges stopped being individual pills: they
       carry free-form extraction text ("2 hours, 45 minutes (mostly roasting
       time)"), which a pill turned into a multi-line lozenge. */
    expect(
      scope.getByText(first.display.badges.join(" · ")),
    ).toBeInTheDocument();
    expect(screen.getByText("2 matches")).toBeInTheDocument();
    expect(
      screen.getByText(/ranked by hybrid score · needs-review excluded/),
    ).toBeInTheDocument();
  });

  it("omits ingredients and badges rows for the minimal fixture card", async () => {
    renderAt("/?q=frittata");
    const minimal = (await screen.findByText(second.item.title)).closest(
      "article",
    ) as HTMLElement;
    const rich = screen
      .getByText(first.item.title)
      .closest("article") as HTMLElement;

    /* The rich card proves both rows render at all — without this the
       absence assertions below would pass just as happily against a
       component that never renders ingredients or badges. */
    expect(
      within(rich).getByText(
        first.structured_preview?.top_ingredients.join(" · ") as string,
      ),
    ).toBeInTheDocument();
    expect(
      within(rich).getByText(first.display.badges.join(" · ")),
    ).toBeInTheDocument();

    /* The minimal fixture supplies neither, so neither row may appear.
       Named explicitly rather than by "contains a dot": the card header now
       separates the book title from the page label with one, so a dot is no
       longer proof that an ingredients or badges row rendered. */
    expect(
      within(minimal).queryByText(
        first.structured_preview?.top_ingredients.join(" · ") as string,
      ),
    ).toBeNull();
    expect(
      within(minimal).queryByText(first.display.badges.join(" · ")),
    ).toBeNull();
  });

  it("links each card to /recipes/:id carrying ?from= the search URL", async () => {
    const router = renderAt("/?q=frittata&mode=vector");
    const title = await screen.findByText(first.item.title);
    const link = title.closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `/recipes/${first.item.id}?from=%2F%3Fq%3Dfrittata%26mode%3Dvector`,
    );
    link.click();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/recipes/${first.item.id}`),
    );
    /* The whole previous URL, decoded symmetrically by URLSearchParams — the
       back link replays it rather than rebuilding it from q and mode. */
    expect(new URLSearchParams(router.state.location.search).get("from")).toBe(
      "/?q=frittata&mode=vector",
    );
  });

  it("keeps the producing mode on held-over cards during a mode change", async () => {
    /* Gate the vector response on a promise the test releases, so the
       placeholder window is deterministic rather than a timing race. */
    let releaseVector = () => {};
    const vectorInFlight = new Promise<void>((resolve) => {
      releaseVector = resolve;
    });
    server.use(
      http.post("/api/v1/search", async ({ request }) => {
        const body = (await request.json()) as { query: string; mode: string };
        if (body.mode === "vector") {
          await vectorInFlight;
        }
        return HttpResponse.json(searchFixture(body.query));
      }),
    );

    const user = userEvent.setup();
    const router = renderAt("/?q=frittata");
    await screen.findByText(first.item.title);
    await runWithMode(user, "Vector only");

    /* Vector is selected in the URL, but the grid still holds hybrid results:
       the subline must say so. */
    await waitFor(() =>
      expect(router.state.location.search).toBe("?q=frittata&mode=vector"),
    );
    expect(
      screen.getByText(/ranked by hybrid score · needs-review excluded/),
    ).toBeInTheDocument();

    /* And the return target names the mode that produced them, not the one
       the URL has already moved on to (review #2.2): a card carrying
       ?mode=vector would send the reader back to a result set the card they
       clicked need not even be in. */
    const link = screen.getByText(first.item.title).closest("a");
    expect(link?.getAttribute("href")).toBe(
      `/recipes/${first.item.id}?from=%2F%3Fq%3Dfrittata`,
    );
    (link as HTMLAnchorElement).click();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/recipes/${first.item.id}`),
    );
    expect(new URLSearchParams(router.state.location.search).get("from")).toBe(
      "/?q=frittata",
    );

    releaseVector();
  });

  it("renders the empty state on zero hits", async () => {
    server.use(emptySearchHandler());
    renderAt("/?q=unicorn");
    expect(
      await screen.findByText("The shelf has nothing for that."),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("article")).toHaveLength(0);
  });

  it("renders the error state with the envelope message", async () => {
    server.use(searchErrorHandler());
    renderAt("/?q=frittata");
    expect(
      await screen.findByText(/Something went wrong on the shelf\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("bare / renders hero only — no skeleton, no grid", async () => {
    renderAt("/");
    await waitFor(() =>
      expect(screen.getByText(/3 cookbooks on the shelf/)).toBeInTheDocument(),
    );
    expect(document.querySelectorAll("article")).toHaveLength(0);
    expect(screen.queryByTestId("search-skeleton")).toBeNull();
  });
});

describe("accentFor", () => {
  it("is stable per id and independent of ordering", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `doc_${i}_x`);
    const first = ids.map(accentFor);
    const reversed = [...ids].reverse().map(accentFor);
    expect(first).toEqual([...reversed].reverse());
    for (const accent of first) {
      expect(["terra", "sage", "butter"]).toContain(accent);
    }
    expect(accentFor("doc_onepan")).toBe(accentFor("doc_onepan"));
  });

  it("gives the two fixture books different accents", () => {
    expect(accentFor(first.document.id)).not.toBe(
      accentFor(second.document.id),
    );
  });
});
