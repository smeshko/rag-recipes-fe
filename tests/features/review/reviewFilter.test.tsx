import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type { DocumentDetailResponse } from "../../../src/api";
import {
  reviewItemsFixture,
  reviewItemsHandler,
  reviewScenario,
} from "../../../src/mocks/review";
import { routes } from "../../../src/routes";
import { documentDetailHandler } from "../../msw/handlers";
import { server } from "../../msw/server";

/* The ?document= filter (TASK-003): the URL is the single source of truth,
   the chip is derived state, and the chip's title comes from the shared
   ['document', id] detail cache — NOT from the review items, because an
   empty filtered list has no items to read a title from. */

/** Detail for the review fixtures' `doc_baking` book. The title deliberately
    differs from the fixture items' `document.title` ("bakingwithlesssugar"),
    so a chip showing it PROVES the detail cache was the source. */
const bakingDetail: DocumentDetailResponse = {
  document: {
    id: "doc_baking",
    asset_id: "asset-doc_baking",
    category: "recipes",
    subcategory: null,
    title: "Baking with Less Sugar",
    author: "Joanne Chang",
    source_type: "pdf",
    language: "en",
    active_source_version: 1,
    status: "needs_review",
    created_at: "2026-07-22T15:45:00Z",
    updated_at: "2026-07-22T15:45:00Z",
  },
  counts: {
    source_spans: 203,
    knowledge_items: 71,
    ready_items: 57,
    needs_review_items: 14,
    chunks: 285,
  },
};

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("review queue ?document= filter", () => {
  it("requests the filtered list and renders only that book's items", async () => {
    const urls: URL[] = [];
    server.use(
      reviewItemsHandler(reviewItemsFixture, (url) => urls.push(url)),
      documentDetailHandler("doc_baking", bakingDetail),
    );
    renderAt("/review?document=doc_baking");

    expect(
      await screen.findByRole("heading", { name: "Maple Cutout Cookies" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Honey Oat Sandwich Loaf" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Rustic Pear Galette" }),
    ).toBeInTheDocument();
    /* The other two books' items never render. */
    expect(
      screen.queryByRole("heading", { name: "Stovetop Skillet Granola" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Everyday Paleo Salad Dressing" }),
    ).not.toBeInTheDocument();

    /* MSW received the filter param on the wire. */
    expect(urls).toHaveLength(1);
    expect(urls[0].searchParams.get("document_id")).toBe("doc_baking");

    /* Chip title from the detail cache, not the items. */
    expect(
      await screen.findByText("filtering: Baking with Less Sugar"),
    ).toBeInTheDocument();
  });

  it("clears back to /review via the chip's × button", async () => {
    const user = userEvent.setup();
    server.use(
      ...reviewScenario(reviewItemsFixture),
      documentDetailHandler("doc_baking", bakingDetail),
    );
    const router = renderAt("/review?document=doc_baking");

    await screen.findByRole("heading", { name: "Maple Cutout Cookies" });
    await user.click(
      screen.getByRole("button", { name: "Clear the book filter" }),
    );

    /* The param is gone and the full queue loads. */
    expect(router.state.location.pathname).toBe("/review");
    expect(router.state.location.search).toBe("");
    expect(
      await screen.findByRole("heading", { name: "Stovetop Skillet Granola" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Everyday Paleo Salad Dressing" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear the book filter" }),
    ).not.toBeInTheDocument();
  });

  it("survives unknown params when clearing (writeParams' discipline)", async () => {
    const user = userEvent.setup();
    server.use(
      ...reviewScenario(reviewItemsFixture),
      documentDetailHandler("doc_baking", bakingDetail),
    );
    const router = renderAt("/review?document=doc_baking&future=param");

    await screen.findByRole("heading", { name: "Maple Cutout Cookies" });
    await user.click(
      screen.getByRole("button", { name: "Clear the book filter" }),
    );

    expect(router.state.location.search).toBe("?future=param");
  });

  it("renders the filtered empty state and clears through it", async () => {
    const user = userEvent.setup();
    server.use(...reviewScenario(reviewItemsFixture));
    /* An unknown id is just a filter matching nothing: 200 + empty list
       (never 404). The detail 404s via the base catch-all, so the chip
       degrades to "this book" — and its clear still works. */
    const router = renderAt("/review?document=doc_missing");

    expect(
      await screen.findByText("Nothing to review for this book."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Nothing waiting for review."),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("filtering: this book")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "See the whole queue" }),
    );

    expect(router.state.location.pathname).toBe("/review");
    expect(router.state.location.search).toBe("");
    expect(
      await screen.findByRole("heading", { name: "Maple Cutout Cookies" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Nothing to review for this book."),
    ).not.toBeInTheDocument();
  });

  it("keeps the nothing-anywhere empty state on a bare empty /review", async () => {
    server.use(...reviewScenario([]));
    renderAt("/review");

    expect(
      await screen.findByText("Nothing waiting for review."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Nothing to review for this book."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear the book filter" }),
    ).not.toBeInTheDocument();
  });

  it("shows no chip on the unfiltered queue", async () => {
    server.use(...reviewScenario(reviewItemsFixture));
    renderAt("/review");

    await screen.findByRole("heading", { name: "Maple Cutout Cookies" });
    expect(
      screen.queryByRole("button", { name: "Clear the book filter" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^filtering:/)).not.toBeInTheDocument();
  });
});
