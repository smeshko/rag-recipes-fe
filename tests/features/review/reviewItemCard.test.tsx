import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type { ReviewItem } from "../../../src/api";
import { reviewItemsFixture, reviewScenario } from "../../../src/mocks/review";
import { routes } from "../../../src/routes";
import { server } from "../../msw/server";

function renderReview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: ["/review"] });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/* Scope every query to the item's own <article> — the fixtures deliberately
   reuse flag messages across items (reviewLink.test.tsx's bookRow idiom). */
const itemCard = async (title: string) => {
  const heading = await screen.findByRole("heading", { name: title, level: 3 });
  const article = heading.closest("article");
  if (!article) throw new Error(`no <article> around '${title}'`);
  return { article, heading, card: within(article) };
};

/* `ReviewFlag.message` is required (`message: string`), so "missing" is
   unrepresentable without a cast — empty string is the real degenerate case
   the runtime fallback must catch. */
const emptyMessageItem: ReviewItem = {
  ...reviewItemsFixture[0],
  id: "ki_empty_message",
  title: "Unlabeled Flag Item",
  flags: [{ code: "low_normalization_confidence", message: "" }],
};

describe("flagged-item card", () => {
  beforeEach(() =>
    server.use(...reviewScenario([...reviewItemsFixture, emptyMessageItem])),
  );

  it("leads with flags[0].message verbatim, before the title in DOM order", async () => {
    renderReview();

    for (const item of reviewItemsFixture) {
      const { card, heading } = await itemCard(item.title);
      const lead = card.getByTestId("review-flag-lead");
      expect(lead).toHaveTextContent(item.flags[0].message);
      /* The lead line precedes the h3 in the document. */
      expect(
        lead.compareDocumentPosition(heading) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("shows every flag on the two-flag item, secondaries beneath the lead", async () => {
    renderReview();

    /* ki_honey_oat_loaf is 4.2's two-flag fixture. */
    const { card, heading } = await itemCard("Honey Oat Sandwich Loaf");
    expect(card.getByTestId("review-flag-lead")).toHaveTextContent(
      "Overall extraction confidence is below the review threshold.",
    );
    const secondaries = card.getAllByTestId("review-flag-secondary");
    expect(secondaries).toHaveLength(1);
    expect(secondaries[0]).toHaveTextContent(
      "The extracted recipe has fewer steps than expected.",
    );
    /* Secondary sits after the lead and before the title. */
    expect(
      card
        .getByTestId("review-flag-lead")
        .compareDocumentPosition(secondaries[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      secondaries[0].compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders no secondary-flag lines on single-flag items", async () => {
    renderReview();

    const { card } = await itemCard("Maple Cutout Cookies");
    expect(card.queryAllByTestId("review-flag-secondary")).toHaveLength(0);
  });

  it("renders title, provenance (book · page span), and summary", async () => {
    renderReview();

    /* Multi-page span → "pp. start–end". */
    const maple = await itemCard("Maple Cutout Cookies");
    expect(
      maple.card.getByText("bakingwithlesssugar · pp. 41–43"),
    ).toBeInTheDocument();
    expect(
      maple.card.getByText(
        "Crisp maple-sweetened cutout cookies for decorating.",
      ),
    ).toBeInTheDocument();

    /* Single-page span → "p. start". */
    const honey = await itemCard("Honey Oat Sandwich Loaf");
    expect(
      honey.card.getByText("bakingwithlesssugar · p. 57"),
    ).toBeInTheDocument();

    /* Null pages: the locator never resolved — book title alone, no span. */
    const granola = await itemCard("Stovetop Skillet Granola");
    expect(granola.card.getByText("onepantorulethemall")).toBeInTheDocument();
    expect(granola.card.queryByText(/p\./)).not.toBeInTheDocument();

    /* Null summary: no summary node rather than an empty paragraph. */
    const galette = await itemCard("Rustic Pear Galette");
    expect(
      galette.card.getByText("bakingwithlesssugar · p. 88"),
    ).toBeInTheDocument();
    expect(
      galette.card.queryByTestId("review-item-summary"),
    ).not.toBeInTheDocument();
  });

  it("links each card to /recipes/<item id>, carrying ?from= the queue", async () => {
    renderReview();

    for (const item of reviewItemsFixture) {
      const { card } = await itemCard(item.title);
      /* The queue's whole URL is the return target — here the bare /review
         this harness renders at; the ?document= case is pinned end to end in
         tests/routing.test.tsx. */
      expect(card.getByRole("link", { name: /view recipe/i })).toHaveAttribute(
        "href",
        `/recipes/${item.id}?from=%2Freview`,
      );
    }
  });

  it("falls back to the raw code when a message is the empty string", async () => {
    renderReview();

    const { card } = await itemCard("Unlabeled Flag Item");
    const lead = card.getByTestId("review-flag-lead");
    /* Never an empty node, never invented copy — the opaque code, verbatim. */
    expect(lead).toHaveTextContent("low_normalization_confidence");
  });
});
