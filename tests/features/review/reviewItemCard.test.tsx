import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type { ReviewItem } from "../../../src/api";
import { reviewItemsFixture, reviewScenario } from "../../../src/mocks/review";
import { routes } from "../../../src/routes";
import { needsReviewItemFixture } from "../../msw/knowledgeItems";
import { server } from "../../msw/server";

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router };
}

const renderReview = () => renderAt("/review");

const url = (router: {
  state: { location: { pathname: string; search: string } };
}) => router.state.location.pathname + router.state.location.search;

/** Serve every knowledge-item id as a flagged, recipe-shaped item, so the
    editor the queue links to reaches its form rung rather than NotEditable —
    the queue's synthetic `ki_*` ids are not in the detail fixtures
    (routing.test.tsx's `anyRecipeHandler`, re-pitched to `needs_review`). */
const anyReviewRecipeHandler = () =>
  http.get("/api/v1/knowledge-items/:itemId", ({ params }) =>
    HttpResponse.json({
      ...needsReviewItemFixture,
      knowledge_item: {
        ...needsReviewItemFixture.knowledge_item,
        id: String(params.itemId),
      },
    }),
  );

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

/* An item the reviewer has ALREADY repaired to the point where the backend
   recomputed every warning away, but which nobody has decided yet — so it is
   still `needs_review` and still in the queue with `flags: []`. Observed live
   on the dev shelf in 5.4 TASK-008: repairing `no_ingredients` on an item
   whose only other flag was also cleared left this exact payload, and the
   unguarded `flags[0]` read took the whole /review route down to React
   Router's error boundary. */
const repairedItem: ReviewItem = {
  ...reviewItemsFixture[0],
  id: "ki_repaired",
  title: "Fully Repaired Item",
  flags: [],
  edited_at: "2026-08-02T21:32:31.333104Z",
};

describe("flagged-item card", () => {
  beforeEach(() =>
    server.use(
      ...reviewScenario([
        ...reviewItemsFixture,
        emptyMessageItem,
        repairedItem,
      ]),
    ),
  );

  it("renders an item whose repair cleared every flag, instead of crashing", async () => {
    renderReview();

    const { card } = await itemCard("Fully Repaired Item");
    /* No lead line to render — and, critically, no thrown TypeError: the rest
       of the queue must still be on screen. */
    expect(card.queryByTestId("review-flag-lead")).not.toBeInTheDocument();
    expect(card.getByTestId("review-flag-cleared")).toHaveTextContent(
      "Nothing is flagged any more",
    );
    /* The repair marker still rides on the provenance line. */
    expect(card.getByTestId("review-edited-marker")).toBeInTheDocument();
    /* The whole queue survived — the sibling cards rendered too. */
    expect(
      await screen.findByRole("heading", { name: "Maple Cutout Cookies" }),
    ).toBeInTheDocument();
  });

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

  it("offers Edit on every card, deep-linking the editor with ?from= the queue", async () => {
    renderReview();

    for (const item of reviewItemsFixture) {
      const { card } = await itemCard(item.title);
      /* A real <Link>, not a button — middle-click and ⌘-click have to work
         — and the queue's whole URL rides along, same call the View link
         makes. */
      const edit = card.getByRole("link", { name: "Edit" });
      expect(edit).toHaveAttribute(
        "href",
        `/recipes/${item.id}/edit?from=%2Freview`,
      );
    }
  });

  /* The epic's criterion end to end: the third verb is reachable from where a
     reviewer works, and 5.1's contract — not a bespoke param — is what brings
     them back to the book they were working through. */
  it("round-trips queue → editor → back link → the filtered queue", async () => {
    server.use(anyReviewRecipeHandler());
    const user = userEvent.setup();
    const { router } = renderAt("/review?document=doc_baking");

    const { card } = await itemCard("Maple Cutout Cookies");
    await user.click(card.getByRole("link", { name: "Edit" }));

    await waitFor(() =>
      expect(url(router)).toBe(
        "/recipes/ki_maple_cutouts/edit?from=%2Freview%3Fdocument%3Ddoc_baking",
      ),
    );
    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();

    const back = await screen.findByRole("link", {
      name: "← Back to review queue",
    });
    await user.click(back);

    await waitFor(() =>
      expect(url(router)).toBe("/review?document=doc_baking"),
    );
    /* The FILTERED queue, not the whole thing. */
    expect(
      await screen.findByRole("heading", { name: "Maple Cutout Cookies" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Stovetop Skillet Granola" }),
    ).not.toBeInTheDocument();
  });

  it("marks an edited item on the meta line, and leaves an unedited one bare", async () => {
    renderReview();

    const paleo = await itemCard("Everyday Paleo Salad Dressing");
    const marker = paleo.card.getByTestId("review-edited-marker");
    expect(marker.tagName).toBe("TIME");
    /* The timestamp rides in `dateTime`; the visible text stays "Edited" —
       no formatted date, which would be a second source of truth about when. */
    expect(marker).toHaveAttribute("datetime", "2026-03-04T09:15:00.482913Z");
    expect(marker.textContent).toBe("Edited");
    /* Appended to the provenance line, not a line of its own. */
    expect(marker.closest("small")).toHaveTextContent(
      "eatdrinkpaleo · p. 112 · Edited",
    );

    const maple = await itemCard("Maple Cutout Cookies");
    expect(
      maple.card.queryByTestId("review-edited-marker"),
    ).not.toBeInTheDocument();
  });

  it("falls back to the raw code when a message is the empty string", async () => {
    renderReview();

    const { card } = await itemCard("Unlabeled Flag Item");
    const lead = card.getByTestId("review-flag-lead");
    /* Never an empty node, never invented copy — the opaque code, verbatim. */
    expect(lead).toHaveTextContent("low_normalization_confidence");
  });
});
