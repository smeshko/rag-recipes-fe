import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../../../src/routes";
import { needsReviewItemFixture } from "../../../msw/knowledgeItems";
import { server } from "../../../msw/server";

/* The two writable panels (5.3 TASK-005), driven through the real route table
   so the page, the form hook and both editors are wired exactly as a reviewer
   meets them. The ordinals are the point: they are `index + 1` at render, so a
   reorder or a removal renumbers the method by construction and nothing about
   the payload's own `step_number` reaches the editor. */

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, queryClient };
}

const sd = needsReviewItemFixture.knowledge_item.structured_data;

async function renderForm(id = "item_review") {
  const user = userEvent.setup();
  const utils = renderAt(`/recipes/${id}/edit`);
  await screen.findByTestId("recipe-edit-page");
  return { user, ...utils };
}

/** A panel by its heading — the two lists live in sibling `<section>`s, so
    every list assertion is scoped rather than global. */
const panel = (name: "Ingredients" | "Method") =>
  screen.getByRole("heading", { name }).closest("section") as HTMLElement;

const valuesIn = (name: "Ingredients" | "Method") =>
  within(panel(name))
    .getAllByRole("textbox")
    .map((el) => (el as HTMLTextAreaElement).value);

/** The rendered ordinals of the method, in render order. */
const ordinals = () =>
  within(panel("Method"))
    .getAllByRole("listitem")
    .map((li) => li.textContent?.match(/^\d+\./)?.[0]);

describe("edit panels", () => {
  it("renders both panels seeded from the payload, in order and named", async () => {
    await renderForm();

    expect(valuesIn("Ingredients")).toEqual(
      sd.ingredients.map((ing) => ing.raw_text),
    );
    expect(valuesIn("Method")).toEqual(sd.steps.map((step) => step.text));

    expect(screen.getByLabelText("Ingredient 1")).toHaveValue(
      "2 Tbsp extra virgin olive oil",
    );
    expect(screen.getByLabelText("Ingredient 3")).toHaveValue("8 large eggs");
    expect(screen.getByLabelText("Step 1")).toHaveValue(
      "Preheat the oven to 375°F.",
    );
    expect(screen.getByLabelText("Step 3")).toHaveValue(
      "Pour in the eggs and bake until puffy.",
    );

    /* Ingredients are a plain <ul> with no check-off affordance — checking a
       box while authoring the list makes no sense (D18). */
    expect(within(panel("Ingredients")).getByRole("list").tagName).toBe("UL");
    expect(within(panel("Method")).getByRole("list").tagName).toBe("OL");
    expect(
      within(panel("Ingredients")).queryByRole("button", { pressed: false }),
    ).not.toBeInTheDocument();
  });

  it("reports the live row counts in the sublines, and follows an add and a remove", async () => {
    const { user } = await renderForm();

    expect(
      within(panel("Ingredients")).getByText(
        "3 lines · one ingredient per line",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel("Method")).getByText("3 steps · numbered as you order them"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Add ingredient" }));
    expect(
      within(panel("Ingredients")).getByText(
        "4 lines · one ingredient per line",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove step 2" }));
    expect(
      within(panel("Method")).getByText("2 steps · numbered as you order them"),
    ).toBeInTheDocument();
  });

  it("numbers the method from render position across a reorder", async () => {
    const { user } = await renderForm();

    expect(ordinals()).toEqual(["1.", "2.", "3."]);

    await user.click(screen.getByRole("button", { name: "Move step 3 up" }));

    /* The ordinals do not travel with the text: the payload's step_number 3
       is now rendered as "2." because it is second. */
    expect(ordinals()).toEqual(["1.", "2.", "3."]);
    expect(valuesIn("Method")).toEqual([
      "Preheat the oven to 375°F.",
      "Pour in the eggs and bake until puffy.",
      "Sauté the onion and spinach until wilted.",
    ]);
  });

  it("renumbers the method after a removal", async () => {
    const { user } = await renderForm();

    await user.click(screen.getByRole("button", { name: "Remove step 1" }));

    expect(ordinals()).toEqual(["1.", "2."]);
    expect(valuesIn("Method")).toEqual([
      "Sauté the onion and spinach until wilted.",
      "Pour in the eggs and bake until puffy.",
    ]);
  });

  it("edits two verbatim-identical ingredient lines independently", async () => {
    const { user } = await renderForm("item_review_dupes");

    expect(valuesIn("Ingredients")).toEqual([
      "1 tsp sea salt",
      "8 large eggs",
      "1 tsp sea salt",
    ]);

    /* Distinct accessible names is the reviewer-facing half; the row-identity
       proof proper is lineListEditor.test.tsx's DOM-node check across a
       reorder. This is the regression guard. */
    await user.type(screen.getByLabelText("Ingredient 3"), ", flaked");

    expect(screen.getByLabelText("Ingredient 1")).toHaveValue("1 tsp sea salt");
    expect(screen.getByLabelText("Ingredient 3")).toHaveValue(
      "1 tsp sea salt, flaked",
    );
  });

  it("logs no duplicate-key warning on the repeated lines", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    await renderForm("item_review_dupes");

    expect(
      warn.mock.calls.some((call) => String(call[0]).includes("same key")),
    ).toBe(false);
    warn.mockRestore();
  });

  it("seeds one blank ingredient row for the no_ingredients case", async () => {
    await renderForm("item_review_empty");

    /* Somewhere to type, not an edit — the form stays clean on mount, which
       editForm.test.tsx asserts on the hook (`isDirty` is not observable in
       the DOM until TASK-006's action row). */
    expect(valuesIn("Ingredients")).toEqual([""]);
    expect(screen.getByLabelText("Ingredient 1")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "+ Add ingredient" }),
    ).toBeInTheDocument();
    expect(valuesIn("Method")).toHaveLength(3);
  });

  it("holds the reviewer's typing against a background refetch", async () => {
    const { user, queryClient } = await renderForm();

    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Frittata, repaired");
    await user.type(screen.getByLabelText("Ingredient 2"), " and thyme");

    /* The same id coming back with different server-side content — a refetch,
       not a different recipe, so the seed must not run again (TASK-002's
       seed-once guard, seen from the page). The other half of that guard —
       the form stays dirty, so Save will still be enabled — is asserted on
       the hook in editForm.test.tsx's "holds the reviewer's typing against a
       fresh payload for the same id"; the Save button itself lands with the
       action row in TASK-006. */
    server.use(
      http.get("/api/v1/knowledge-items/item_review", () =>
        HttpResponse.json({
          ...needsReviewItemFixture,
          knowledge_item: {
            ...needsReviewItemFixture.knowledge_item,
            title: "Renamed on the server",
          },
        }),
      ),
    );
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["knowledge-item", "item_review"],
      });
    });

    expect(screen.getByLabelText("Title")).toHaveValue("Frittata, repaired");
    expect(screen.getByLabelText("Ingredient 2")).toHaveValue(
      "1 small onion, peeled and diced and thyme",
    );
    expect(
      screen.queryByDisplayValue("Renamed on the server"),
    ).not.toBeInTheDocument();
  });

  it("leaves the read page's two-column grid and checkable rows alone", async () => {
    const { container } = renderAt("/recipes/item_review");
    /* `recipe-page` is the wrapper and renders during the skeleton too, so
       the wait has to be on something the loaded body owns. */
    await screen.findByRole("heading", { name: "Ingredients" });
    expect(screen.getByTestId("recipe-page")).toBeInTheDocument();

    expect(container.querySelector('[class*="1.7fr"]')).not.toBeNull();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(3);
    expect(screen.queryByLabelText("Ingredient 1")).not.toBeInTheDocument();
  });
});
