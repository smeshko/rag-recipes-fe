import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import {
  editableItemsFixture,
  editScenario,
} from "../../../src/mocks/knowledgeItems";
import { routes } from "../../../src/routes";
import { needsReviewItemFixture } from "../../msw/knowledgeItems";
import { server } from "../../msw/server";

/* The read page's review callout (5.4 TASK-005): what is still flagged,
   whether anyone has corrected it already, and the way in. Everything renders
   through the real route table with `createMemoryRouter` — the idiom the rest
   of `tests/recipe/` uses — because the Edit link's claim is *where it lands*,
   which only a real navigation can settle.

   Two fixture sets, on purpose: the flag projection cases run against 5.2's
   editable mocks, whose `review_reasons` come from the same
   `buildReviewReasons` the PATCH mock recomputes with, and the round trips run
   against the 2.2 read fixtures the edit-page suites already use. */

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

/** A one-off detail payload for `item_review`, for the shapes no fixture holds. */
function serveReviewItem(knowledgeItem: Record<string, unknown>) {
  const payload = {
    ...needsReviewItemFixture,
    knowledge_item: {
      ...needsReviewItemFixture.knowledge_item,
      ...knowledgeItem,
    },
  };
  server.use(
    http.get("/api/v1/knowledge-items/item_review", () =>
      HttpResponse.json(payload),
    ),
  );
}

const flagTexts = () =>
  screen
    .getAllByTestId(/^recipe-flag-/)
    .map((node) => node.textContent?.trim() ?? "");

const editLink = () => screen.getByTestId("recipe-edit-link");

describe("ReviewCallout", () => {
  it("lists every flag the backend sent, verbatim and in order", async () => {
    server.use(...editScenario(editableItemsFixture));
    renderAt("/recipes/item_edit_noingredients");

    expect(await screen.findByTestId("review-callout")).toBeInTheDocument();
    expect(flagTexts()).toEqual([
      "No ingredients were extracted.",
      "Overall extraction confidence was below the threshold.",
    ]);
    expect(
      screen.queryByText(/nothing is flagged any more/i),
    ).not.toBeInTheDocument();
  });

  it("falls back to the raw code when a flag carries no message", async () => {
    serveReviewItem({
      review_reasons: [
        { code: "llm_warning", message: "" },
        { code: "no_steps", message: "No preparation steps were extracted." },
      ],
    });
    renderAt("/recipes/item_review");

    expect(await screen.findByTestId("review-callout")).toBeInTheDocument();
    expect(flagTexts()).toEqual([
      "llm_warning",
      "No preparation steps were extracted.",
    ]);
  });

  it("renders nothing at all for a decided item", async () => {
    renderAt("/recipes/item_full");

    /* Awaited on the title, not the page shell: `recipe-page` is committed
       while the item is still loading, and an empty page trivially has no
       callout. */
    expect(
      await screen.findByRole("heading", {
        name: "Spinach and Cheddar Frittata",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("review-callout")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^recipe-flag-/)).not.toBeInTheDocument();
  });

  it("says so explicitly once every warning has cleared", async () => {
    serveReviewItem({ review_reasons: [] });
    renderAt("/recipes/item_review");

    expect(await screen.findByTestId("review-callout")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nothing is flagged any more — approve it from the queue.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(/^recipe-flag-/)).not.toBeInTheDocument();
    /* The way back in survives the clearing — the item is still undecided. */
    expect(editLink()).toBeInTheDocument();
  });

  it("shows no edited marker on an item nobody has touched", async () => {
    renderAt("/recipes/item_review");

    expect(await screen.findByTestId("review-callout")).toBeInTheDocument();
    expect(
      screen.queryByTestId("recipe-edited-marker"),
    ).not.toBeInTheDocument();
  });

  it("marks an edited item with the timestamp, and no formatted date", async () => {
    serveReviewItem({ edited_at: "2026-04-01T10:20:30.123456Z" });
    renderAt("/recipes/item_review");

    const marker = await screen.findByTestId("recipe-edited-marker");
    expect(marker.tagName).toBe("TIME");
    expect(marker).toHaveAttribute("datetime", "2026-04-01T10:20:30.123456Z");
    expect(marker.textContent).toBe("Edited");
  });

  it("carries the recipe's own return target into the editor", async () => {
    const user = userEvent.setup();
    const { router } = renderAt(
      "/recipes/item_review?from=%2Freview%3Fdocument%3Ddoc_x",
    );

    const link = await screen.findByTestId("recipe-edit-link");
    expect(link).toHaveAttribute(
      "href",
      "/recipes/item_review/edit?from=%2Freview%3Fdocument%3Ddoc_x",
    );

    await user.click(link);

    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/recipes/item_review/edit");
    /* The whole point of forwarding the *validated* target rather than the
       recipe's own URL: a captured `/recipes/:id` classifies as null and would
       dump the reviewer on search. */
    const back = await screen.findByRole("link", {
      name: "← Back to review queue",
    });
    expect(back).toHaveAttribute("href", "/review?document=doc_x");
  });

  it("degrades to Cook when the recipe was loaded directly", async () => {
    const user = userEvent.setup();
    const { router } = renderAt("/recipes/item_review");

    const link = await screen.findByTestId("recipe-edit-link");
    expect(link).toHaveAttribute("href", "/recipes/item_review/edit");

    await user.click(link);

    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/recipes/item_review/edit");
    const back = await screen.findByRole("link", { name: "← Back to Cook" });
    expect(back).toHaveAttribute("href", "/");
  });

  it("ignores a hand-edited off-origin target rather than forwarding it", async () => {
    renderAt("/recipes/item_review?from=%2F%2Fevil.com");

    expect(await screen.findByTestId("recipe-edit-link")).toHaveAttribute(
      "href",
      "/recipes/item_review/edit",
    );
  });
});
