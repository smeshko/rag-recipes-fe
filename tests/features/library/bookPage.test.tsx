import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../../src/routes";
import {
  BOOK_ID,
  bookItemsFixture,
  documentKnowledgeItemsErrorHandler,
  documentKnowledgeItemsHandler,
  documentNotFoundEnvelope,
  ingestionRunningEnvelope,
  knowledgeItemDeleteErrorHandler,
  knowledgeItemDeleteHandler,
} from "../../msw/documentKnowledgeItems";
import { libraryShelfHandlers } from "../../msw/handlers";
import { server } from "../../msw/server";

/* /library/:documentId — a book's contents, with an edit and a delete per row.
   Rendered through the real route table with createMemoryRouter (the idiom the
   rest of features/* uses) because the route has to actually match and the
   card's links have to resolve against it. */

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
  return { router, queryClient };
}

const BOOK_PATH = `/library/${BOOK_ID}`;

const rowFor = async (title: string) => {
  const heading = await screen.findByRole("heading", { name: title });
  const article = heading.closest("article");
  if (!article) throw new Error(`no <article> around '${title}'`);
  return within(article);
};

beforeEach(() => {
  server.use(
    ...libraryShelfHandlers(),
    documentKnowledgeItemsHandler(BOOK_ID, bookItemsFixture),
  );
});

describe("a book's contents", () => {
  it("lists every recipe with its status, page span and title", async () => {
    renderAt(BOOK_PATH);

    expect(
      await screen.findByRole("heading", { name: "One Pan to Rule Them All" }),
    ).toBeInTheDocument();
    for (const title of [
      "Skillet Chicken",
      "Sheet Pan Salmon",
      "Braised Beans",
      "Slow Lamb",
    ]) {
      expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    }

    const shelved = await rowFor("Skillet Chicken");
    expect(shelved.getByText("Ready")).toBeInTheDocument();
    expect(shelved.getByText("pp. 42–43")).toBeInTheDocument();

    /* A single-page span collapses to `p. N`, and a null summary simply is not
       rendered rather than becoming an empty paragraph. */
    const salmon = await rowFor("Sheet Pan Salmon");
    /* Regex, not an exact string: the span shares its <small> with the
       edited marker, so the element's text is "p. 88 · Edited". */
    expect(salmon.getByText(/p\. 88/)).toBeInTheDocument();
    expect(salmon.queryByTestId("recipe-row-summary")).not.toBeInTheDocument();
    expect(salmon.getByTestId("recipe-edited-marker")).toBeInTheDocument();

    /* The two statuses the read page never had to render. */
    expect(
      (await rowFor("Braised Beans")).getByText("Needs review"),
    ).toBeInTheDocument();
    expect(
      (await rowFor("Slow Lamb")).getByText("Indexing"),
    ).toBeInTheDocument();
  });

  it("counts only what the query actually returned", async () => {
    renderAt(BOOK_PATH);
    expect(await screen.findByText("4 recipes")).toBeInTheDocument();
  });

  it("carries the page's whole URL as ?from= on every link out", async () => {
    renderAt(`${BOOK_PATH}?status=ready`);

    const row = await rowFor("Skillet Chicken");
    const from = encodeURIComponent(`${BOOK_PATH}?status=ready`);
    expect(row.getByRole("link", { name: /view recipe/i })).toHaveAttribute(
      "href",
      `/recipes/item_skillet_chicken?from=${from}`,
    );
    expect(row.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/recipes/item_skillet_chicken/edit?from=${from}`,
    );
  });

  it("offers Edit only where an edit can succeed", async () => {
    renderAt(BOOK_PATH);

    /* Both editable statuses get the link... */
    expect(
      (await rowFor("Skillet Chicken")).getByRole("link", { name: "Edit" }),
    ).toBeInTheDocument();
    expect(
      (await rowFor("Braised Beans")).getByRole("link", { name: "Edit" }),
    ).toBeInTheDocument();
    /* ...and the mid-flight one does not, because the backend would 409. */
    expect(
      (await rowFor("Slow Lamb")).queryByRole("link", { name: "Edit" }),
    ).not.toBeInTheDocument();
    /* Delete, by contrast, is offered at every status. */
    expect(
      (await rowFor("Slow Lamb")).getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
  });
});

describe("the status filter", () => {
  it("reads the filter from the URL and requests it", async () => {
    const seen: URL[] = [];
    server.use(
      documentKnowledgeItemsHandler(BOOK_ID, bookItemsFixture, (url) =>
        seen.push(url),
      ),
    );
    renderAt(`${BOOK_PATH}?status=needs_review`);

    expect(
      await screen.findByRole("heading", { name: "Braised Beans" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Skillet Chicken" }),
    ).not.toBeInTheDocument();
    expect(seen[0]?.searchParams.get("status")).toBe("needs_review");
    expect(
      screen.getByRole("button", { name: "Needs review" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("writes the filter into the URL when a chip is pressed", async () => {
    const user = userEvent.setup();
    const { router } = renderAt(BOOK_PATH);
    await screen.findByRole("heading", { name: "Skillet Chicken" });

    await user.click(screen.getByRole("button", { name: "Ready" }));

    await waitFor(() =>
      expect(router.state.location.search).toBe("?status=ready"),
    );
    expect(
      screen.queryByRole("heading", { name: "Braised Beans" }),
    ).not.toBeInTheDocument();
  });

  it("treats a hand-typed empty ?status= as no filter at all", async () => {
    /* `||` not `??`: otherwise the UI goes unfiltered while the request still
       carries a literal `status=` and the cache mints a phantom entry. */
    const seen: URL[] = [];
    server.use(
      documentKnowledgeItemsHandler(BOOK_ID, bookItemsFixture, (url) =>
        seen.push(url),
      ),
    );
    renderAt(`${BOOK_PATH}?status=`);

    await screen.findByRole("heading", { name: "Skillet Chicken" });
    expect(seen[0]?.searchParams.has("status")).toBe(false);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps ?from= when the filter changes", async () => {
    const user = userEvent.setup();
    const { router } = renderAt(`${BOOK_PATH}?from=%2Flibrary`);
    await screen.findByRole("heading", { name: "Skillet Chicken" });

    await user.click(screen.getByRole("button", { name: "Ready" }));

    await waitFor(() =>
      expect(router.state.location.search).toContain("from=%2Flibrary"),
    );
    expect(router.state.location.search).toContain("status=ready");
  });

  it("offers a way back out of an empty filtered list", async () => {
    const user = userEvent.setup();
    const { router } = renderAt(`${BOOK_PATH}?status=superseded`);

    expect(
      await screen.findByText(/nothing in this book is superseded/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /see every recipe/i }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });
});

describe("deleting a recipe", () => {
  it("confirms in place before firing anything", async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    const items = [...bookItemsFixture];
    server.use(
      documentKnowledgeItemsHandler(BOOK_ID, items),
      knowledgeItemDeleteHandler(items, (id) => deleted.push(id)),
    );
    renderAt(BOOK_PATH);

    const row = await rowFor("Skillet Chicken");
    await user.click(row.getByRole("button", { name: "Delete" }));

    expect(row.getByText(/deleting is permanent/i)).toBeInTheDocument();
    expect(deleted).toEqual([]);

    /* Backing out restores the action row and still sends nothing. */
    await user.click(row.getByRole("button", { name: "Keep" }));
    expect(row.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(deleted).toEqual([]);
  });

  it("removes the row optimistically and sends the delete", async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    /* A per-test copy the delete handler really splices, so the hook's own
       re-sync refetch agrees with the optimistic removal instead of undoing
       it. */
    const items = [...bookItemsFixture];
    server.use(
      documentKnowledgeItemsHandler(BOOK_ID, items),
      knowledgeItemDeleteHandler(items, (id) => deleted.push(id)),
    );
    renderAt(BOOK_PATH);

    const row = await rowFor("Skillet Chicken");
    await user.click(row.getByRole("button", { name: "Delete" }));
    await user.click(row.getByRole("button", { name: "Delete recipe" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Skillet Chicken" }),
      ).not.toBeInTheDocument(),
    );
    expect(deleted).toEqual(["item_skillet_chicken"]);
    /* Its neighbours are untouched. */
    expect(
      screen.getByRole("heading", { name: "Braised Beans" }),
    ).toBeInTheDocument();
  });

  it("rolls the row back and announces the reason when the delete fails", async () => {
    /* The trap this case exists for: the optimistic removal UNMOUNTS the card,
       so a message held in the card's own state would die in the rollback
       re-mount. It lives on the page, keyed by item id. */
    const user = userEvent.setup();
    server.use(
      knowledgeItemDeleteErrorHandler(409, ingestionRunningEnvelope(BOOK_ID)),
    );
    renderAt(BOOK_PATH);

    const row = await rowFor("Skillet Chicken");
    await user.click(row.getByRole("button", { name: "Delete" }));
    await user.click(row.getByRole("button", { name: "Delete recipe" }));

    const restored = await rowFor("Skillet Chicken");
    /* The backend's own sentence, verbatim — the house rule. */
    expect(await restored.findByRole("alert")).toHaveTextContent(
      "Document is not in a terminal state.",
    );
    expect(
      screen.getByRole("heading", { name: "Skillet Chicken" }),
    ).toBeInTheDocument();
  });
});

describe("the states ladder", () => {
  it("shows the skeleton before the list settles", async () => {
    renderAt(BOOK_PATH);
    expect(screen.getByTestId("book-skeleton")).toBeInTheDocument();
    /* An outage is not an empty book: no confident zero before it settles. */
    expect(screen.getByText("— recipes")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Skillet Chicken" });
  });

  it("renders the empty state for a book that produced nothing", async () => {
    server.use(documentKnowledgeItemsHandler(BOOK_ID, []));
    renderAt(BOOK_PATH);

    expect(
      await screen.findByText(/no recipes came out of this book/i),
    ).toBeInTheDocument();
  });

  it("renders the error box with the backend's message and retries", async () => {
    server.use(
      documentKnowledgeItemsErrorHandler(BOOK_ID, 500, {
        error: {
          code: "internal_error",
          message: "The stove hiccuped.",
          details: {},
        },
      }),
    );
    const user = userEvent.setup();
    renderAt(BOOK_PATH);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The stove hiccuped.",
    );

    server.use(documentKnowledgeItemsHandler(BOOK_ID, bookItemsFixture));
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(
      await screen.findByRole("heading", { name: "Skillet Chicken" }),
    ).toBeInTheDocument();
  });

  it("treats an unknown book as a stale link, not an outage", async () => {
    /* Both calls 404, as the real backend does — the document is *addressed*
       by this route, so an unknown id is not an empty book. */
    server.use(
      documentKnowledgeItemsErrorHandler(
        "book-ghost",
        404,
        documentNotFoundEnvelope("book-ghost"),
      ),
    );
    renderAt("/library/book-ghost");

    expect(
      await screen.findByText(/that book is not on the shelf/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to the shelf/i }),
    ).toHaveAttribute("href", "/library");
    expect(document.querySelector(".bg-danger-fill")).toBeNull();
  });
});

describe("getting there and back", () => {
  it("is reachable from the shelf, and links back to it", async () => {
    const user = userEvent.setup();
    const { router } = renderAt("/library");

    await user.click(
      await screen.findByRole("link", { name: "One Pan to Rule Them All" }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe(BOOK_PATH));
    expect(router.state.location.search).toBe("?from=%2Flibrary");
    expect(
      await screen.findByRole("link", { name: /back to your shelf/i }),
    ).toHaveAttribute("href", "/library");
  });

  it("makes the whole card clickable, not just the title", async () => {
    /* Stretched link: the title is still the only <a>, but its ::after covers
       the card. Asserted structurally, because jsdom has no layout — a click
       on the row cannot be simulated, so the overlay class and the raised
       sibling controls are the checkable claim. */
    renderAt("/library");

    const title = await screen.findByRole("link", {
      name: "One Pan to Rule Them All",
    });
    expect(title.className).toContain("after:absolute");
    expect(title.className).toContain("after:inset-0");

    const card = title.closest("article");
    expect(card?.className).toContain("relative");
    expect(card?.className).toContain("isolate");

    /* The controls that share the card must sit ABOVE the overlay, or the
       card-wide hit area swallows them. */
    const reprocess = screen.getAllByRole("button", { name: /reprocess/i })[0];
    expect(reprocess.closest("div")?.className).toContain("z-10");
  });

  it("keeps the row's own controls working under the overlay", async () => {
    const user = userEvent.setup();
    const { router } = renderAt("/library");

    /* A click on the review link must go to the queue, not to the book. */
    const queueLink = (
      await screen.findAllByRole("link", { name: /open review queue/i })
    )[0];
    await user.click(queueLink);

    await waitFor(() => expect(router.state.location.pathname).toBe("/review"));
  });

  it("does not link a book that has nothing to list yet", async () => {
    renderAt("/library");
    /* Queued: still extracting, so the title stays plain text. */
    expect(
      await screen.findByRole("heading", { name: "The Green Roasting Tin" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "The Green Roasting Tin" }),
    ).not.toBeInTheDocument();
  });

  it("shows no back link on a directly-loaded book page", async () => {
    renderAt(BOOK_PATH);
    await screen.findByRole("heading", { name: "Skillet Chicken" });
    expect(screen.queryByRole("link", { name: /back to/i })).toBeNull();
  });

  it("names the book when a recipe was reached from it", async () => {
    /* The `book` return section, which exists so the label says "the book"
       rather than sending the reader one hop too far, back to the shelf. */
    const from = encodeURIComponent(BOOK_PATH);
    renderAt(`/recipes/item_review?from=${from}`);

    expect(
      await screen.findByRole("link", { name: /back to the book/i }),
    ).toHaveAttribute("href", BOOK_PATH);
  });
});
