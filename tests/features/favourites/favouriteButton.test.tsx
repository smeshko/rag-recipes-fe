import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../../src/routes";
import {
  BOOK_ID,
  bookItemsFixture,
  documentKnowledgeItemsHandler,
} from "../../msw/documentKnowledgeItems";
import { favouriteRow, favouritesScenario } from "../../msw/favourites";
import { libraryShelfHandlers, searchFixture } from "../../msw/handlers";
import { fullItemFixture } from "../../msw/knowledgeItems";
import { server } from "../../msw/server";

/* The star, on each of the three surfaces that host one besides /favourites.

   The button is the same component everywhere; what differs is where each
   surface gets its answer from — the item's own `favourited_at` on the recipe
   page and a book row, the ['favourites'] id set on a search card, which is
   the one row shape the backend's search projection cannot answer for. */

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

const [firstResult] = searchFixture("frittata").results;

/** The full detail fixture, already starred — spread rather than copied so it
    cannot drift from the shape every other recipe test renders. */
const savedItemHandler = http.get(
  "/api/v1/knowledge-items/item_favourited",
  () =>
    HttpResponse.json({
      ...fullItemFixture,
      knowledge_item: {
        ...fullItemFixture.knowledge_item,
        id: "item_favourited",
        favourited_at: "2026-08-24T09:00:00Z",
      },
    }),
);

describe("the star on a search result", () => {
  it("starts hollow, fills on click, and PUTs the recipe", async () => {
    const writes: string[] = [];
    server.use(
      ...favouritesScenario([], {
        onWrite: (method, itemId) => writes.push(`${method} ${itemId}`),
      }),
    );
    const user = userEvent.setup();
    renderAt("/?q=frittata");

    const star = await screen.findByRole("button", {
      name: `Save ${firstResult.display.title} to favourites`,
    });
    expect(star).toHaveAttribute("aria-pressed", "false");

    await user.click(star);

    /* The button carries its own optimism, so the star reads as saved before
       the list it feeds has refetched. */
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "true"));
    expect(writes).toEqual([`PUT ${firstResult.item.id}`]);
  });

  it("renders already-saved cards pressed, from the favourites list", async () => {
    server.use(
      ...favouritesScenario([favouriteRow({ id: firstResult.item.id })]),
    );
    renderAt("/?q=frittata");

    /* Name-as-assertion: the label says what the click will DO, so a filled
       star must offer to remove rather than to save. */
    expect(
      await screen.findByRole("button", {
        name: `Remove ${firstResult.display.title} from favourites`,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("does not navigate to the recipe when the star is clicked", async () => {
    server.use(...favouritesScenario([]));
    const user = userEvent.setup();
    const router = renderAt("/?q=frittata");

    await user.click(
      await screen.findByRole("button", {
        name: `Save ${firstResult.display.title} to favourites`,
      }),
    );

    /* The card is a link and the star sits ON it; a <button> nested inside
       that <a> would have navigated here. */
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("the star on the recipe page", () => {
  it("reads the item's own favourited_at and clears it on click", async () => {
    const writes: string[] = [];
    server.use(
      ...favouritesScenario([], {
        onWrite: (method, itemId) => writes.push(`${method} ${itemId}`),
      }),
    );
    server.use(savedItemHandler);
    const user = userEvent.setup();
    renderAt("/recipes/item_favourited");

    const actions = await screen.findByTestId("recipe-actions");
    const star = within(actions).getByRole("button", { name: /favourites$/ });
    expect(star).toHaveAttribute("aria-pressed", "true");

    await user.click(star);

    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "false"));
    expect(writes).toEqual(["DELETE item_favourited"]);
  });

  it("is hollow for an unsaved recipe and stars it on click", async () => {
    const writes: string[] = [];
    server.use(
      ...favouritesScenario([], {
        onWrite: (method, itemId) => writes.push(`${method} ${itemId}`),
      }),
    );
    const user = userEvent.setup();
    renderAt("/recipes/item_full");

    const actions = await screen.findByTestId("recipe-actions");
    const star = within(actions).getByRole("button", { name: /favourites$/ });
    expect(star).toHaveAttribute("aria-pressed", "false");

    await user.click(star);

    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "true"));
    expect(writes).toEqual(["PUT item_full"]);
  });

  it("snaps back and announces the backend's message when the write fails", async () => {
    server.use(
      ...favouritesScenario([], {
        writeFails: { status: 500, message: "Unexpected server error." },
      }),
    );
    const user = userEvent.setup();
    renderAt("/recipes/item_full");

    const actions = await screen.findByTestId("recipe-actions");
    const star = within(actions).getByRole("button", { name: /favourites$/ });
    await user.click(star);

    expect(await within(actions).findByRole("alert")).toHaveTextContent(
      "Unexpected server error.",
    );
    /* The optimism is dropped on failure: the star tells the truth about the
       server, not about the click. */
    expect(star).toHaveAttribute("aria-pressed", "false");
  });
});

describe("the star on a book's contents row", () => {
  it("reads the row's own favourited_at", async () => {
    server.use(
      ...libraryShelfHandlers(),
      documentKnowledgeItemsHandler(BOOK_ID, bookItemsFixture),
      ...favouritesScenario([]),
    );
    renderAt(`/library/${BOOK_ID}`);

    /* The listing rows carry `favourited_at`, so a book's contents needs no
       second request to know which of its recipes are saved. */
    const stars = await screen.findAllByTestId("favourite-toggle");
    expect(stars.length).toBeGreaterThan(0);
    expect(
      stars.some((star) => star.getAttribute("aria-pressed") === "true"),
    ).toBe(true);
  });
});
