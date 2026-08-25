import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type {
  KnowledgeItemCreateRequest,
  KnowledgeItemResponse,
} from "../../../../src/api";
import {
  createScenario,
  MANUAL_SHELF_DOCUMENT_ID,
} from "../../../../src/mocks/knowledgeItems";
import { routes } from "../../../../src/routes";
import { server } from "../../../msw/server";

/* Writing a recipe by hand. Everything renders through the real route table
   with `createMemoryRouter` — the idiom `edit/` established — because
   `/recipes/new` has to actually match (and must not be read as an item id),
   because `UnsavedGuard` needs a data router, and because half the claims here
   are about where the author ends up. */

const NEW_PATH = "/recipes/new";

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

async function renderForm(path = NEW_PATH) {
  const user = userEvent.setup();
  const utils = renderAt(path);
  await screen.findByTestId("recipe-new-page");
  return { user, ...utils };
}

const saveButton = () => screen.getByTestId("create-save");
const titleField = () => screen.getByLabelText("Title");

/** Type a whole recipe: the title, one ingredient and one step. The two lists
    each start with one blank row, so this needs no Add clicks. */
async function typeARecipe(user: ReturnType<typeof userEvent.setup>) {
  await user.type(titleField(), "Roast Tomato Soup");
  await user.type(screen.getByLabelText("Ingredient 1"), "500 g tomatoes");
  await user.type(screen.getByLabelText("Step 1"), "Roast, then blitz.");
}

describe("the form", () => {
  it("opens blank, with a row in each list to type into", async () => {
    await renderForm();

    expect(titleField()).toHaveValue("");
    expect(screen.getByLabelText("Ingredient 1")).toHaveValue("");
    expect(screen.getByLabelText("Step 1")).toHaveValue("");
    /* Not "Editing": the eyebrow names the shelf the recipe will land on. */
    expect(screen.getByText("Handwritten")).toBeInTheDocument();
  });

  it("is reached by a static path, never as a recipe id", async () => {
    const { router } = await renderForm();

    expect(router.state.location.pathname).toBe(NEW_PATH);
    /* The read page would have rendered for an item called "new". */
    expect(screen.queryByTestId("recipe-page")).not.toBeInTheDocument();
  });

  it("cannot be saved untitled", async () => {
    const { user } = await renderForm();

    expect(saveButton()).toBeDisabled();

    await user.type(screen.getByLabelText("Ingredient 1"), "500 g tomatoes");
    /* Ingredients alone are not enough — the title is the one required field,
       and it is also the recipe's own chunk. */
    expect(saveButton()).toBeDisabled();

    await user.type(titleField(), "Roast Tomato Soup");
    expect(saveButton()).toBeEnabled();
  });

  it("saves a recipe that is only a title", async () => {
    /* The backend accepts it, because PATCH accepts emptying both lists. A
       stricter rule here would be a trap on the way in. */
    const bodies: KnowledgeItemCreateRequest[] = [];
    server.use(...createScenario((body) => bodies.push(body)));
    const { user } = await renderForm();

    await user.type(titleField(), "Something I'll finish later");
    await user.click(saveButton());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      title: "Something I'll finish later",
      ingredients: [],
      steps: [],
    });
  });
});

describe("the wire body", () => {
  it("sends the whole recipe, trimmed, with blank rows dropped", async () => {
    const bodies: KnowledgeItemCreateRequest[] = [];
    server.use(...createScenario((body) => bodies.push(body)));
    const { user } = await renderForm();

    await user.type(titleField(), "  Roast Tomato Soup  ");
    await user.type(screen.getByLabelText("Summary"), "Tastes of the oven.");
    await user.type(screen.getByLabelText("Serves"), "4");
    await user.type(screen.getByLabelText("Ingredient 1"), "500 g tomatoes");
    await user.click(screen.getByRole("button", { name: "+ Add ingredient" }));
    /* Added and never filled in: a blank line is a 422, so it must not go out
       rather than be sent and rejected. */
    await user.type(screen.getByLabelText("Step 1"), "Roast, then blitz.");
    await user.click(saveButton());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      title: "Roast Tomato Soup",
      summary: "Tastes of the oven.",
      yield: "4",
      ingredients: ["500 g tomatoes"],
      steps: ["Roast, then blitz."],
    });
  });

  it("omits the optional scalars nobody filled in", async () => {
    /* Absent rather than null: on a row that does not exist yet the two mean
       the same thing, and omitting keeps the request to what was written. */
    const bodies: KnowledgeItemCreateRequest[] = [];
    server.use(...createScenario((body) => bodies.push(body)));
    const { user } = await renderForm();

    await typeARecipe(user);
    await user.click(saveButton());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(Object.keys(bodies[0]).sort()).toEqual([
      "ingredients",
      "steps",
      "title",
    ]);
  });
});

describe("after a save", () => {
  it("lands on the new recipe, read from the cache the mutation wrote", async () => {
    server.use(
      ...createScenario(),
      /* Hangs every read of a created item, so anything the recipe page shows
         came from the 201 the mutation cached, not from a refetch. */
      http.get("/api/v1/knowledge-items/:itemId", async ({ params }) => {
        return String(params.itemId).startsWith("item_written_")
          ? await delay("infinite")
          : undefined;
      }),
    );
    const { user, router } = await renderForm();

    await typeARecipe(user);
    await user.click(saveButton());

    await screen.findByTestId("recipe-page");
    expect(router.state.location.pathname).toBe("/recipes/item_written_1");
    expect(screen.getByText("Roast Tomato Soup")).toBeInTheDocument();
  });

  it("caches the created recipe under its own id", async () => {
    server.use(...createScenario());
    const { user, queryClient } = await renderForm();

    await typeARecipe(user);
    await user.click(saveButton());

    await waitFor(() => {
      const cached = queryClient.getQueryData<KnowledgeItemResponse>([
        "knowledge-item",
        "item_written_1",
      ]);
      expect(cached?.knowledge_item.document_id).toBe(MANUAL_SHELF_DOCUMENT_ID);
    });
  });

  it("does not ask to discard the recipe it just saved", async () => {
    /* The form is still full of everything that was typed, so without the
       discard latch the unsaved guard would block its own success navigation. */
    server.use(...createScenario());
    const { user } = await renderForm();

    await typeARecipe(user);
    await user.click(saveButton());

    await screen.findByTestId("recipe-page");
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  });

  it("keeps the author where they went if they left mid-save", async () => {
    server.use(
      http.post("/api/v1/knowledge-items", async () => {
        await delay(60);
        return undefined;
      }),
      ...createScenario(),
    );
    const { user, router } = await renderForm();

    await typeARecipe(user);
    await user.click(saveButton());
    /* Cancel raises the discard latch, so this navigation is not blocked. */
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/library"),
    );

    /* The save still lands — what is dropped is the navigation, not the act. */
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(router.state.location.pathname).toBe("/library");
  });
});

describe("when the save fails", () => {
  it("says so in the backend's own words and keeps the draft", async () => {
    server.use(
      http.post("/api/v1/knowledge-items", () =>
        HttpResponse.json(
          {
            error: {
              code: "internal_error",
              message: "Failed to enqueue the indexing job.",
              details: {},
            },
          },
          { status: 500 },
        ),
      ),
    );
    const { user, router } = await renderForm();

    await typeARecipe(user);
    await user.click(saveButton());

    const alert = await screen.findByTestId("create-failed");
    expect(alert).toHaveTextContent("Failed to enqueue the indexing job.");
    expect(router.state.location.pathname).toBe(NEW_PATH);
    /* Nothing typed is thrown away — retrying is the obvious next move. */
    expect(titleField()).toHaveValue("Roast Tomato Soup");
    expect(saveButton()).toBeEnabled();
  });
});

describe("leaving with unsaved work", () => {
  it("asks before navigating away", async () => {
    const { user } = await renderForm();

    await user.type(titleField(), "Roast Tomato Soup");
    await user.click(screen.getByRole("link", { name: /Back to/ }));

    expect(
      await screen.findByText("Discard your changes?"),
    ).toBeInTheDocument();
  });

  it("does not ask when nothing was typed", async () => {
    const { user, router } = await renderForm();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/library"),
    );
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  });
});
