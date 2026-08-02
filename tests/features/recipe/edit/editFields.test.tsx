import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type { KnowledgeItemResponse } from "../../../../src/api";
import { useEditForm } from "../../../../src/features/recipe/edit/useEditForm";
import { routes } from "../../../../src/routes";
import { needsReviewItemFixture } from "../../../msw/knowledgeItems";

/* The six scalar editors (5.3 TASK-003). The DOM assertions stay behavioural —
   what a reviewer sees and types — and the patch body is read at the hook
   level, because the Save button that would otherwise expose it lands with the
   action row in TASK-006. */

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
  return { ...utils, router };
}

const ki = needsReviewItemFixture.knowledge_item;

async function renderForm() {
  const user = userEvent.setup();
  renderAt("/recipes/item_review/edit");
  await screen.findByTestId("recipe-edit-page");
  return { user };
}

describe("edit form scalar fields", () => {
  it("renders all six fields by label, seeded from the payload", async () => {
    await renderForm();

    expect(screen.getByLabelText("Title")).toHaveValue(ki.title);
    expect(screen.getByLabelText("Summary")).toHaveValue(ki.summary);
    expect(screen.getByLabelText("Serves")).toHaveValue("4–6 servings");
    expect(screen.getByLabelText("Total")).toHaveValue("30 minutes");
  });

  it("renders a field the payload leaves null as empty, not 'null'", async () => {
    await renderForm();

    /* prep_time and cook_time are null on this fixture. */
    expect(screen.getByLabelText("Prep")).toHaveValue("");
    expect(screen.getByLabelText("Cook")).toHaveValue("");
    expect(screen.queryByDisplayValue("null")).not.toBeInTheDocument();
  });

  it("typing in Summary updates only Summary", async () => {
    const { user } = await renderForm();

    const summary = screen.getByLabelText("Summary");
    await user.clear(summary);
    await user.type(summary, "Weeknight eggs.");

    expect(summary).toHaveValue("Weeknight eggs.");
    expect(screen.getByLabelText("Title")).toHaveValue(ki.title);
    expect(screen.getByLabelText("Serves")).toHaveValue("4–6 servings");
    expect(screen.getByLabelText("Total")).toHaveValue("30 minutes");
    expect(screen.getByLabelText("Prep")).toHaveValue("");
    expect(screen.getByLabelText("Cook")).toHaveValue("");
  });

  it("derives a patch naming summary alone after that edit", () => {
    const { result } = renderHook(() =>
      useEditForm(needsReviewItemFixture as unknown as KnowledgeItemResponse),
    );

    act(() => result.current.setField("summary", "Weeknight eggs."));

    expect(result.current.patchBody()).toEqual({ summary: "Weeknight eggs." });
  });

  it("hints when the title is cleared, and withdraws the hint when it returns", async () => {
    const { user } = await renderForm();

    const title = screen.getByLabelText("Title");
    expect(
      screen.queryByText("A recipe needs a title."),
    ).not.toBeInTheDocument();

    await user.clear(title);
    expect(screen.getByText("A recipe needs a title.")).toBeInTheDocument();

    await user.type(title, "Frittata");
    expect(
      screen.queryByText("A recipe needs a title."),
    ).not.toBeInTheDocument();
  });

  it("flips isValid with the emptied title the hint describes", () => {
    const { result } = renderHook(() =>
      useEditForm(needsReviewItemFixture as unknown as KnowledgeItemResponse),
    );

    act(() => result.current.setField("title", ""));
    expect(result.current.isValid).toBe(false);

    act(() => result.current.setField("title", "Frittata"));
    expect(result.current.isValid).toBe(true);
  });
});
