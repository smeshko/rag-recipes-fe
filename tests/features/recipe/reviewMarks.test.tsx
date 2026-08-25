import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import {
  flagDetail,
  flaggedIngredientPositions,
  isBelow,
  lowFields,
} from "../../../src/features/recipe/reviewMarks";
import { routes } from "../../../src/routes";
import { needsReviewItemFixture } from "../../msw/knowledgeItems";
import { server } from "../../msw/server";

/* Reviewer marks: the FE renders the backend's `ingredient_positions` /
   `value` / `threshold` aids and the item-level `review_thresholds` as
   visible marks on the lines and fields they point at. The invariant under
   test is "the backend judges, the FE marks": every mark below traces to a
   number in the payload, and a payload without thresholds renders none. */

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

const THRESHOLDS = { overall: 0.5, boundary: 0.5, normalization: 0.5 };

const ingredient = (
  position: number,
  raw_text: string,
  normalization: number | null,
) => ({
  position,
  raw_text,
  confidence: normalization === null ? null : { overall: 0.9, normalization },
});

/** A flagged item with one ingredient under the bound, one step under the
    bound, and a doubted title and yield. */
function serveMarkedItem(overrides: Record<string, unknown> = {}) {
  const base = needsReviewItemFixture.knowledge_item;
  const knowledge_item = {
    ...base,
    confidence: {
      overall: 0.41,
      boundary: 0.8,
      fields: { title: 0.3, summary: 0.9, yield: 0.2, ingredients: 0.9 },
    },
    structured_data: {
      ...base.structured_data,
      yield: "Serves 2",
      ingredients: [
        ingredient(1, "1 Tbsp coconut oil", 0.95),
        ingredient(2, "Handful of mint leaves", 0.31),
        ingredient(3, "1 lemon, halved", 0.6),
      ],
      steps: [
        { step_number: 1, text: "Melt the oil.", confidence: { overall: 0.9 } },
        {
          step_number: 2,
          text: "Add the wine.",
          confidence: { overall: 0.35 },
        },
      ],
      warnings: ["low_normalization_confidence", "low_overall_confidence"],
    },
    review_reasons: [
      {
        code: "low_normalization_confidence",
        message:
          "An ingredient normalization confidence was below the threshold.",
        value: 0.31,
        threshold: 0.5,
        ingredient_positions: [2],
      },
      {
        code: "low_overall_confidence",
        message: "Overall extraction confidence was below the threshold.",
        value: 0.41,
        threshold: 0.5,
      },
    ],
    review_thresholds: THRESHOLDS,
    ...overrides,
  };
  server.use(
    http.get("/api/v1/knowledge-items/item_review", () =>
      HttpResponse.json({ ...needsReviewItemFixture, knowledge_item }),
    ),
  );
}

describe("reviewMarks helpers", () => {
  it("isBelow is strict and tolerant of junk", () => {
    expect(isBelow(0.49, 0.5)).toBe(true);
    expect(isBelow(0.5, 0.5)).toBe(false);
    expect(isBelow("0.1", 0.5)).toBe(false);
    expect(isBelow(0.1, null)).toBe(false);
    expect(isBelow(Number.NaN, 0.5)).toBe(false);
  });

  it("collects positions only from normalization flags", () => {
    expect(
      flaggedIngredientPositions([
        {
          code: "low_normalization_confidence",
          message: "",
          ingredient_positions: [2, 5],
        },
        {
          code: "low_overall_confidence",
          message: "",
          ingredient_positions: [9],
        },
        { code: "low_normalization_confidence", message: "" },
      ]),
    ).toEqual(new Set([2, 5]));
  });

  it("flagDetail renders the aids it has and nothing otherwise", () => {
    expect(flagDetail({ code: "no_steps", message: "x" })).toBeNull();
    expect(
      flagDetail({
        code: "low_overall_confidence",
        message: "x",
        value: 0.412,
        threshold: 0.5,
      }),
    ).toBe("0.41 — threshold 0.50");
    expect(
      flagDetail({
        code: "low_normalization_confidence",
        message: "x",
        value: 0.3,
        threshold: 0.5,
        ingredient_positions: [1, 4],
      }),
    ).toBe("0.30 — threshold 0.50 · 2 ingredients marked below");
    expect(
      flagDetail({
        code: "low_normalization_confidence",
        message: "x",
        ingredient_positions: [1],
      }),
    ).toBe("1 ingredient marked below");
  });

  it("lowFields judges every field against the overall bound", () => {
    expect(lowFields({ title: 0.3, summary: 0.9 }, THRESHOLDS)).toEqual({
      title: { score: 0.3, threshold: 0.5 },
    });
    expect(lowFields({ title: 0.3 }, null)).toEqual({});
  });
});

describe("review marks on the recipe page", () => {
  it("marks the ingredient rows the backend named, with their score", async () => {
    serveMarkedItem();
    renderAt("/recipes/item_review");

    const flagged = await screen.findAllByTestId("ingredient-flagged");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toHaveTextContent("Handful of mint leaves");
    const score = within(flagged[0]).getByTestId("ingredient-score");
    expect(score).toHaveAttribute("data-score", "0.31");
    expect(score).toHaveAccessibleName(
      "Normalization confidence 0.31 — below the 0.50 threshold",
    );
    /* The 0.6 row is above the bound and unnamed: no mark. */
    expect(screen.getAllByTestId("ingredient-score")).toHaveLength(1);
  });

  it("marks a step whose own score sits under the overall bound", async () => {
    serveMarkedItem();
    renderAt("/recipes/item_review");

    const flagged = await screen.findAllByTestId("step-flagged");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toHaveTextContent("Add the wine.");
    expect(within(flagged[0]).getByTestId("step-score")).toHaveAttribute(
      "data-score",
      "0.35",
    );
  });

  it("marks a doubted title and yield, not a confident summary", async () => {
    serveMarkedItem();
    renderAt("/recipes/item_review");

    expect(await screen.findByTestId("title-score")).toHaveAttribute(
      "data-score",
      "0.30",
    );
    expect(screen.getByTestId("yield-score")).toHaveAttribute(
      "data-score",
      "0.20",
    );
    expect(screen.queryByTestId("summary-score")).not.toBeInTheDocument();
  });

  it("footnotes each flag with its score against the bound", async () => {
    serveMarkedItem();
    renderAt("/recipes/item_review");

    await screen.findByTestId("review-callout");
    expect(
      screen.getAllByTestId("review-flag-detail").map((n) => n.textContent),
    ).toEqual([
      "0.31 — threshold 0.50 · 1 ingredient marked below",
      "0.41 — threshold 0.50",
    ]);
    /* The flag copy itself is still the backend's, untouched. */
    expect(screen.getByTestId("recipe-flag-lead")).toHaveTextContent(
      /^An ingredient normalization confidence was below the threshold\.$/,
    );
  });

  it("marks the named row even when its own score is missing", async () => {
    serveMarkedItem({
      structured_data: {
        ...needsReviewItemFixture.knowledge_item.structured_data,
        ingredients: [
          ingredient(1, "1 Tbsp coconut oil", 0.95),
          ingredient(2, "Handful of mint leaves", null),
        ],
        warnings: ["low_normalization_confidence"],
      },
    });
    renderAt("/recipes/item_review");

    const flagged = await screen.findAllByTestId("ingredient-flagged");
    expect(flagged[0]).toHaveTextContent("Handful of mint leaves");
    expect(screen.queryByTestId("ingredient-score")).not.toBeInTheDocument();
  });

  it("renders no marks without thresholds or positions on the wire", async () => {
    serveMarkedItem({
      review_thresholds: null,
      review_reasons: [
        {
          code: "low_normalization_confidence",
          message:
            "An ingredient normalization confidence was below the threshold.",
        },
      ],
    });
    renderAt("/recipes/item_review");

    await screen.findByTestId("review-callout");
    expect(screen.queryByTestId("ingredient-flagged")).not.toBeInTheDocument();
    expect(screen.queryByTestId("step-flagged")).not.toBeInTheDocument();
    expect(screen.queryByTestId("title-score")).not.toBeInTheDocument();
    expect(screen.queryByTestId("review-flag-detail")).not.toBeInTheDocument();
  });

  it("carries the flagged row into the editor, by identity not text", async () => {
    serveMarkedItem();
    renderAt("/recipes/item_review/edit");

    const rows = await screen.findAllByTestId("edit-row-flagged");
    expect(rows).toHaveLength(1);
    expect(
      within(rows[0]).getByRole("textbox", { name: "Ingredient 2" }),
    ).toHaveValue("Handful of mint leaves");
  });
});
