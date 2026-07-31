import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { ingredientLines } from "../../src/features/recipe/ingredientLines";
import { routes } from "../../src/routes";
import { fullItemFixture } from "../msw/knowledgeItems";
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

function itemRequestSpy() {
  const spy = vi.fn();
  server.events.on("request:start", ({ request }) => {
    if (request.url.includes("/api/v1/knowledge-items/")) {
      spy();
    }
  });
  return spy;
}

afterEach(() => {
  server.events.removeAllListeners();
});

const fullIngredients =
  fullItemFixture.knowledge_item.structured_data.ingredients;
const fullSteps = fullItemFixture.knowledge_item.structured_data.steps;

describe("panels", () => {
  it("renders ingredients and steps verbatim in declared order", async () => {
    renderAt("/recipes/item_full");
    const ingredientsPanel = (
      await screen.findByRole("heading", { name: "Ingredients" })
    ).closest("section") as HTMLElement;
    const rows = within(ingredientsPanel).getAllByRole("button");
    expect(rows).toHaveLength(fullIngredients.length);
    rows.forEach((row, i) => {
      expect(row).toHaveTextContent(fullIngredients[i]?.raw_text as string);
    });
    expect(
      within(ingredientsPanel).getByText(
        `${fullIngredients.length} items · tap to check off`,
      ),
    ).toBeInTheDocument();

    const methodPanel = screen
      .getByRole("heading", { name: "Method" })
      .closest("section") as HTMLElement;
    const steps = within(methodPanel).getAllByRole("listitem");
    expect(steps).toHaveLength(fullSteps.length);
    steps.forEach((li, i) => {
      expect(li).toHaveTextContent(fullSteps[i]?.text as string);
    });
    expect(
      within(methodPanel).getByText(
        `${fullSteps.length} steps · extracted with 0.98 confidence`,
      ),
    ).toBeInTheDocument();
  });

  it("toggles a row client-side only — no extra requests", async () => {
    const user = userEvent.setup();
    const spy = itemRequestSpy();
    renderAt("/recipes/item_full");
    const first = (
      await screen.findAllByRole("button", { pressed: false })
    )[0] as HTMLElement;
    const before = spy.mock.calls.length;
    await user.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    const others = screen.getAllByRole("button", { pressed: false });
    expect(others.length).toBe(fullIngredients.length - 1);
    await user.click(first);
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(spy.mock.calls.length).toBe(before);
  });

  it("falls back to ingredients_text lines for the sparse fixture", async () => {
    renderAt("/recipes/item_sparse");
    expect(await screen.findByText("1 can beans")).toBeInTheDocument();
    expect(screen.getByText("a pinch of salt")).toBeInTheDocument();
    /* No confidence fragment when confidence is null. */
    expect(screen.queryByText(/confidence/)).toBeNull();
  });

  it("checks off a repeated ingredient line independently of its twin", async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    renderAt("/recipes/item_dupes");
    const rows = await screen.findAllByRole("button", { pressed: false });
    expect(rows).toHaveLength(3);
    /* Rows 0 and 2 carry the same text; ticking the second must not tick
       the first (index-keyed state over a text-keyed list). */
    await user.click(rows[2] as HTMLElement);
    expect(rows[2]).toHaveAttribute("aria-pressed", "true");
    expect(rows[0]).toHaveAttribute("aria-pressed", "false");
    expect(rows[1]).toHaveAttribute("aria-pressed", "false");
    expect(
      warn.mock.calls.some((call) => String(call[0]).includes("same key")),
    ).toBe(false);
    warn.mockRestore();
  });

  it("degrades on malformed steps — drops textless rows, numbers by position", async () => {
    renderAt("/recipes/item_badsteps");
    const methodPanel = (
      await screen.findByRole("heading", { name: "Method" })
    ).closest("section") as HTMLElement;
    const items = within(methodPanel).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1.Warm the pan.");
    expect(items[1]).toHaveTextContent("2.Serve.");
    /* The count must match what is rendered, not what arrived. */
    expect(within(methodPanel).getByText(/^2 steps/)).toBeInTheDocument();
  });

  it("renders the extracting copy for a mid-ingest item", async () => {
    renderAt("/recipes/item_extracting_empty");
    expect(await screen.findAllByText("Still being extracted…")).toHaveLength(
      2,
    );
  });
});

describe("ingredientLines", () => {
  it("prefers structured rows sorted by position", () => {
    const res = ingredientLines({
      ingredients: [
        { position: 2, raw_text: "second" },
        { position: 1, raw_text: "first" },
      ],
      ingredients_text: "ignored",
    });
    expect(res).toEqual({ kind: "structured", lines: ["first", "second"] });
  });

  it("splits text lines dropping empties", () => {
    const res = ingredientLines({
      ingredients: [],
      ingredients_text: " a \n\n b \n",
    });
    expect(res).toEqual({ kind: "text", lines: ["a", "b"] });
  });

  it("resolves empty when both are absent", () => {
    expect(ingredientLines({})).toEqual({ kind: "empty" });
  });
});
