import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../../src/routes";
import {
  knowledgeItemDeleteErrorHandler,
  knowledgeItemDeleteHandler,
} from "../../msw/documentKnowledgeItems";
import {
  fullItemFixture,
  needsReviewItemFixture,
} from "../../msw/knowledgeItems";
import { server } from "../../msw/server";

/* The read page's action row: Edit and Delete on every recipe, however the
   reader got here. Rendered through the real route table with
   `createMemoryRouter` — the idiom the rest of `tests/recipe/` uses — because
   both claims are about *where a click lands*, which only a real navigation
   can settle. */

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
  return { router };
}

/** A one-off detail payload for `item_full`, for statuses no fixture holds. */
function serveFullItem(knowledgeItem: Record<string, unknown>) {
  server.use(
    http.get("/api/v1/knowledge-items/item_full", () =>
      HttpResponse.json({
        ...fullItemFixture,
        knowledge_item: {
          ...fullItemFixture.knowledge_item,
          ...knowledgeItem,
        },
      }),
    ),
  );
}

const FULL_TITLE = fullItemFixture.display.title;

describe("the action row", () => {
  it("offers Edit and Delete on a shelved recipe, which had neither", async () => {
    /* The gap this closed: `item_full` is `ready`, so its only edit affordance
       used to be a callout that renders for needs_review alone. */
    renderAt("/recipes/item_full");

    await screen.findByRole("heading", { name: FULL_TITLE });
    expect(screen.getByTestId("recipe-edit-link")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-delete")).toBeInTheDocument();
    expect(screen.queryByTestId("review-callout")).not.toBeInTheDocument();
  });

  it("offers them on a flagged recipe too, and only one Edit", async () => {
    renderAt("/recipes/item_review");

    await screen.findByTestId("review-callout");
    /* getAllBy, not getBy: the point is the COUNT. The callout used to carry
       its own Edit link, and leaving it there would have put two on the page. */
    expect(screen.getAllByTestId("recipe-edit-link")).toHaveLength(1);
    expect(screen.getByTestId("recipe-delete")).toBeInTheDocument();
  });

  it("hides Edit where an edit cannot succeed, but still offers Delete", async () => {
    serveFullItem({ status: "indexing" });
    renderAt("/recipes/item_full");

    await screen.findByRole("heading", { name: FULL_TITLE });
    expect(screen.queryByTestId("recipe-edit-link")).not.toBeInTheDocument();
    expect(screen.getByTestId("recipe-delete")).toBeInTheDocument();
  });

  it("reaches the editor from a shelved recipe, carrying the return target", async () => {
    const user = userEvent.setup();
    const { router } = renderAt("/recipes/item_full?from=%2Flibrary");

    await user.click(await screen.findByTestId("recipe-edit-link"));

    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/recipes/item_full/edit");
    /* The forwarded target is the *validated* one, so the editor's back link
       names where the reader actually came from. */
    expect(
      await screen.findByRole("link", { name: "← Back to your shelf" }),
    ).toHaveAttribute("href", "/library");
  });
});

describe("deleting from the read page", () => {
  it("confirms in place before firing anything", async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    server.use(
      knowledgeItemDeleteHandler([{ id: "item_full" }], (id) =>
        deleted.push(id),
      ),
    );
    const { router } = renderAt("/recipes/item_full");

    await user.click(await screen.findByTestId("recipe-delete"));
    expect(screen.getByText(/deleting is permanent/i)).toBeInTheDocument();
    expect(deleted).toEqual([]);
    expect(router.state.location.pathname).toBe("/recipes/item_full");

    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.getByTestId("recipe-delete")).toBeInTheDocument();
    expect(deleted).toEqual([]);
  });

  it("leaves for the return target once the recipe is gone", async () => {
    /* It has to navigate: the row no longer exists, so staying here is a 404. */
    const user = userEvent.setup();
    server.use(knowledgeItemDeleteHandler([{ id: "item_full" }]));
    const { router } = renderAt("/recipes/item_full?from=%2Flibrary");

    await user.click(await screen.findByTestId("recipe-delete"));
    await user.click(screen.getByTestId("recipe-delete-confirm"));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/library"),
    );
  });

  it("falls back to the library when there is no return target", async () => {
    const user = userEvent.setup();
    server.use(knowledgeItemDeleteHandler([{ id: "item_full" }]));
    const { router } = renderAt("/recipes/item_full");

    await user.click(await screen.findByTestId("recipe-delete"));
    await user.click(screen.getByTestId("recipe-delete-confirm"));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/library"),
    );
  });

  it("stays put and announces the reason when the delete fails", async () => {
    const user = userEvent.setup();
    server.use(
      knowledgeItemDeleteErrorHandler(409, {
        error: {
          code: "ingestion_already_running",
          message: "Document is not in a terminal state.",
          details: {},
        },
      }),
    );
    const { router } = renderAt("/recipes/item_full");

    await user.click(await screen.findByTestId("recipe-delete"));
    await user.click(screen.getByTestId("recipe-delete-confirm"));

    /* The backend's own sentence, verbatim — the house rule. */
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Document is not in a terminal state.",
    );
    expect(router.state.location.pathname).toBe("/recipes/item_full");
    expect(screen.getByRole("heading", { name: FULL_TITLE })).toBeVisible();
  });
});

describe("reaching the read page from anywhere", () => {
  it("still shows the verbs on a directly-loaded recipe", async () => {
    /* "Regardless of how I end up there": no ?from=, no referring list. */
    renderAt(`/recipes/${needsReviewItemFixture.knowledge_item.id}`);

    expect(await screen.findByTestId("recipe-actions")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-edit-link")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-delete")).toBeInTheDocument();
  });
});
