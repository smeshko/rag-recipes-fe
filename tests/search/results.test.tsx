import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    for (const badge of first.display.badges) {
      expect(scope.getByText(badge)).toBeInTheDocument();
    }
    expect(screen.getByText("2 matches")).toBeInTheDocument();
    expect(
      screen.getByText(/ranked by hybrid score · needs-review excluded/),
    ).toBeInTheDocument();
  });

  it("omits ingredients and badges rows for the minimal fixture card", async () => {
    renderAt("/?q=frittata");
    const title = await screen.findByText(second.item.title);
    const card = title.closest("article") as HTMLElement;
    expect(within(card).queryAllByText(/·/)).toHaveLength(0);
    expect(card.querySelectorAll("li")).toHaveLength(0);
  });

  it("links each card to /recipes/:id carrying {q, mode} state", async () => {
    const router = renderAt("/?q=frittata&mode=vector");
    const title = await screen.findByText(first.item.title);
    const link = title.closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(`/recipes/${first.item.id}`);
    link.click();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/recipes/${first.item.id}`),
    );
    expect(router.state.location.state).toEqual({
      q: "frittata",
      mode: "vector",
    });
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
