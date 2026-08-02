import { act, renderHook } from "@testing-library/react";
import type { KnowledgeItemResponse } from "../../../../src/api";
import type { LineRow } from "../../../../src/features/recipe/edit/useEditForm";
import { useEditForm } from "../../../../src/features/recipe/edit/useEditForm";
import {
  duplicateLinesReviewItemFixture,
  emptyIngredientsReviewItemFixture,
  needsReviewItemFixture,
} from "../../../msw/knowledgeItems";

/* `useEditForm` needs no router and no query cache — it takes the loaded
   payload as a value, so the fixtures go in directly (TASK-002 note). The
   fixtures are hand-written JSON shapes rather than typed literals, hence the
   one cast at the boundary. */
const asItem = (fixture: unknown) => fixture as KnowledgeItemResponse;

const reviewItem = asItem(needsReviewItemFixture);
const dupesItem = asItem(duplicateLinesReviewItemFixture);
const emptyItem = asItem(emptyIngredientsReviewItemFixture);

const sd = needsReviewItemFixture.knowledge_item.structured_data;

function mount(item: KnowledgeItemResponse = reviewItem) {
  return renderHook(({ item: current }) => useEditForm(current), {
    initialProps: { item },
  });
}

type Hook = ReturnType<typeof mount>["result"];

function editRow(
  result: Hook,
  list: "ingredients" | "steps",
  index: number,
  text: string,
) {
  act(() => {
    result.current.setRows(
      list,
      result.current.form[list].map((row: LineRow, i: number) =>
        i === index ? { ...row, text } : row,
      ),
    );
  });
}

describe("useEditForm seeding", () => {
  it("seeds every scalar and both lists from the loaded item, clean", () => {
    const { result } = mount();

    expect(result.current.form.title).toBe(
      needsReviewItemFixture.knowledge_item.title,
    );
    expect(result.current.form.summary).toBe(
      needsReviewItemFixture.knowledge_item.summary,
    );
    expect(result.current.form.yieldText).toBe("4–6 servings");
    expect(result.current.form.totalTime).toBe("30 minutes");
    /* Null times seed as "", never as the string "null". */
    expect(result.current.form.prepTime).toBe("");
    expect(result.current.form.cookTime).toBe("");

    expect(result.current.form.ingredients.map((row) => row.text)).toEqual(
      sd.ingredients.map((ing) => ing.raw_text),
    );
    expect(result.current.form.steps.map((row) => row.text)).toEqual(
      sd.steps.map((s) => s.text),
    );

    expect(result.current.isDirty).toBe(false);
    expect(result.current.isValid).toBe(true);
    expect(result.current.patchBody()).toEqual({});
  });

  it("seeds one blank ingredient row for an item with no ingredients", () => {
    const { result } = mount(emptyItem);

    expect(result.current.form.ingredients).toHaveLength(1);
    expect(result.current.form.ingredients[0]?.text).toBe("");
    /* The blank row is somewhere to type, not an edit. */
    expect(result.current.isDirty).toBe(false);
    expect(result.current.patchBody()).toEqual({});
  });

  it("mints ids unique across both lists and across seeded and added rows", () => {
    const { result } = mount();

    const seeded = [
      ...result.current.form.ingredients,
      ...result.current.form.steps,
    ].map((row) => row.id);
    expect(new Set(seeded).size).toBe(seeded.length);

    let minted = "";
    act(() => {
      minted = result.current.newRow("ingredients").id;
    });
    expect(seeded).not.toContain(minted);
  });

  it("gives two verbatim-identical ingredient lines independent identities", () => {
    const { result } = mount(dupesItem);

    const [first, , third] = result.current.form.ingredients;
    expect(first?.text).toBe("1 tsp sea salt");
    expect(third?.text).toBe("1 tsp sea salt");
    expect(first?.id).not.toBe(third?.id);

    editRow(result, "ingredients", 2, "1 tsp flaky sea salt");
    expect(result.current.form.ingredients[0]?.text).toBe("1 tsp sea salt");
    expect(result.current.form.ingredients[2]?.text).toBe(
      "1 tsp flaky sea salt",
    );
  });
});

describe("useEditForm dirty tracking and validity", () => {
  it("treats whitespace-only churn as no edit, and a real character as one", () => {
    const { result } = mount();
    const title = needsReviewItemFixture.knowledge_item.title;

    act(() => result.current.setField("title", `${title} `));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.patchBody()).toEqual({});

    act(() => result.current.setField("title", "Spinach and Gruyère Frittata"));
    expect(result.current.isDirty).toBe(true);
    expect(result.current.patchBody()).toEqual({
      title: "Spinach and Gruyère Frittata",
    });
  });

  it("returns to clean when an edit is typed and then undone by hand", () => {
    const { result } = mount();
    const title = needsReviewItemFixture.knowledge_item.title;

    act(() => result.current.setField("title", "Something else"));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setField("title", title));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.patchBody()).toEqual({});
  });

  it("serializes an emptied nullable scalar as null", () => {
    const { result } = mount();

    act(() => result.current.setField("summary", "   "));
    expect(result.current.isDirty).toBe(true);
    expect(result.current.patchBody()).toEqual({ summary: null });
  });

  it("marks an emptied title invalid", () => {
    const { result } = mount();

    act(() => result.current.setField("title", "  "));
    expect(result.current.isValid).toBe(false);
    /* Save is disabled while invalid (D10/D12), so patchBody is never
       consulted in this state — isValid is the whole observable. */
    act(() => result.current.setField("title", "A title"));
    expect(result.current.isValid).toBe(true);
  });
});

describe("useEditForm patch derivation", () => {
  it("sends the whole steps array as string[] and no ingredients key", () => {
    const { result } = mount();

    editRow(result, "steps", 1, "Sauté the onion until soft.");

    const body = result.current.patchBody();
    expect(body).toEqual({
      steps: [
        "Preheat the oven to 375°F.",
        "Sauté the onion until soft.",
        "Pour in the eggs and bake until puffy.",
      ],
    });
    expect("ingredients" in body).toBe(false);
  });

  it("treats a pure reorder as an edit and sends the reordered array", () => {
    const { result } = mount();
    const seeded = result.current.form.ingredients;

    act(() => {
      result.current.setRows("ingredients", [
        seeded[1] as LineRow,
        seeded[0] as LineRow,
        seeded[2] as LineRow,
      ]);
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.patchBody()).toEqual({
      ingredients: [
        "1 small onion, peeled and diced",
        "2 Tbsp extra virgin olive oil",
        "8 large eggs",
      ],
    });
  });

  it("sends [] — a present, empty array — when every row is removed", () => {
    const { result } = mount();

    act(() => result.current.setRows("ingredients", []));

    const body = result.current.patchBody();
    expect(body.ingredients).toEqual([]);
    expect("ingredients" in body).toBe(true);
    expect(body.ingredients).not.toBeNull();
  });

  it("ignores a blank added row, in the compare and on the wire", () => {
    const { result } = mount();

    act(() => {
      result.current.setRows("ingredients", [
        ...result.current.form.ingredients,
        result.current.newRow("ingredients"),
      ]);
    });
    expect(result.current.form.ingredients).toHaveLength(4);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.patchBody()).toEqual({});

    editRow(result, "ingredients", 3, "a pinch of nutmeg");
    expect(result.current.isDirty).toBe(true);
    expect(result.current.patchBody().ingredients).toHaveLength(4);

    editRow(result, "ingredients", 3, "  ");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.patchBody()).toEqual({});
  });

  /* The backend matches submitted lines back to existing rows BY TEXT and
     promises untouched lines pass through byte-identical (edit-api-contract
     §1). `ingredientLines`' structured arm maps `raw_text` without trimming, so
     padding really does reach the form — and trimming it on the way out would
     demote an untouched row to human-authored, nulling its parse and its source
     spans (review #1.1). */
  const paddedItem = asItem({
    ...needsReviewItemFixture,
    knowledge_item: {
      ...needsReviewItemFixture.knowledge_item,
      id: "item_review_padded",
      structured_data: {
        ...sd,
        ingredients: [
          {
            ...sd.ingredients[0],
            raw_text: "  2 Tbsp extra virgin olive oil  ",
          },
          { ...sd.ingredients[1], raw_text: "   " },
          sd.ingredients[2],
        ],
        steps: [
          { ...sd.steps[0], text: "\tPreheat the oven to 375°F." },
          sd.steps[1],
          sd.steps[2],
        ],
      },
    },
  });

  it("resends an untouched padded row with its original bytes", () => {
    const { result } = mount(paddedItem);

    /* Untouched, despite the padding — the compare is normalized (D8). */
    expect(result.current.isDirty).toBe(false);

    editRow(result, "ingredients", 2, "9 large eggs");

    /* The padded row rides out untouched; the whitespace-only row drops,
       because a blank element is itself a 422 (D9). */
    const body = result.current.patchBody();
    expect(body.ingredients).toEqual([
      "  2 Tbsp extra virgin olive oil  ",
      "9 large eggs",
    ]);

    editRow(result, "steps", 2, "Bake until puffy and just set.");
    expect(result.current.patchBody().steps?.[0]).toBe(
      "\tPreheat the oven to 375°F.",
    );
  });

  it("normalizes a row the reviewer actually edited, and drops blanks", () => {
    const { result } = mount(paddedItem);

    /* A row the reviewer genuinely retyped goes out trimmed rather than
       carrying their stray spacing — the byte-preservation is for UNTOUCHED
       rows only. */
    editRow(result, "ingredients", 0, "  3 Tbsp extra virgin olive oil  ");

    expect(result.current.patchBody().ingredients).toEqual([
      "3 Tbsp extra virgin olive oil",
      "8 large eggs",
    ]);
  });

  it("has no side effects — two calls agree and leave isDirty alone", () => {
    const { result } = mount();

    act(() => result.current.setField("yieldText", "8 servings"));
    const first = result.current.patchBody();
    const second = result.current.patchBody();
    expect(first).toEqual(second);
    expect(first).toEqual({ yield: "8 servings" });
    expect(result.current.isDirty).toBe(true);
  });
});

describe("useEditForm seed-once", () => {
  it("holds the reviewer's typing against a fresh payload for the same id", () => {
    const { result, rerender } = mount();

    act(() => result.current.setField("title", "My repaired title"));

    /* A background refetch of ["knowledge-item", id] hands the hook a brand
       new object carrying a different server-side title. Reseeding here would
       silently discard everything typed. */
    rerender({
      item: asItem({
        ...needsReviewItemFixture,
        knowledge_item: {
          ...needsReviewItemFixture.knowledge_item,
          title: "Server-side rename",
        },
      }),
    });

    expect(result.current.form.title).toBe("My repaired title");
    expect(result.current.isDirty).toBe(true);
  });

  it("reseeds when the item id actually changes", () => {
    const { result, rerender } = mount();

    act(() => result.current.setField("title", "My repaired title"));
    rerender({ item: dupesItem });

    expect(result.current.form.title).toBe(
      duplicateLinesReviewItemFixture.knowledge_item.title,
    );
    expect(result.current.form.ingredients.map((row) => row.text)).toEqual([
      "1 tsp sea salt",
      "8 large eggs",
      "1 tsp sea salt",
    ]);
    expect(result.current.isDirty).toBe(false);
  });
});
