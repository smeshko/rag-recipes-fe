import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type {
  ReviewDecisionRequest,
  ReviewDecisionResponse,
  ReviewListResponse,
} from "../../../src/api";
import {
  reviewDecisionHandler,
  reviewItemsFixture,
  reviewNotPendingEnvelope,
} from "../../../src/mocks/review";
import { routes } from "../../../src/routes";
import { server } from "../../msw/server";

/* Approve/reject wiring (TASK-004): optimistic removal against every
   ['review-items', …] cache entry, an inline confirm gating reject, and a
   rollback + role="alert" line on failure. Every re-sync invalidation is the
   hook's own composed settle (4.2 D8) — these tests only exercise the card's
   snapshot/removal/rollback choreography and its UI. */

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderReview(client = makeClient()) {
  const router = createMemoryRouter(routes, { initialEntries: ["/review"] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router };
}

/* Scope every query to the item's own <article> (reviewItemCard.test.tsx's
   idiom) — fixtures reuse flag copy across items, and after a rollback the
   restored card is a NEW article node, so helpers re-resolve it. */
const itemCard = async (title: string) => {
  const heading = await screen.findByRole("heading", { name: title, level: 3 });
  const article = heading.closest("article");
  if (!article) throw new Error(`no <article> around '${title}'`);
  return { article, heading, card: within(article) };
};

/** A POST that only answers once the test releases it — the lever proving
    removal happens BEFORE the response resolves. */
const gatedDecision = (respond: (itemId: string) => Response) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let resolved = false;
  const bodies: ReviewDecisionRequest[] = [];
  const itemIds: string[] = [];
  const handler = http.post(
    "/api/v1/knowledge-items/:itemId/review",
    async ({ params, request }) => {
      itemIds.push(String(params.itemId));
      bodies.push((await request.json()) as ReviewDecisionRequest);
      await gate;
      resolved = true;
      return respond(String(params.itemId));
    },
  );
  return {
    handler,
    release: () => release(),
    isResolved: () => resolved,
    bodies,
    itemIds,
  };
};

const decidedJson = (itemId: string, decision: "approved" | "rejected") =>
  HttpResponse.json({
    knowledge_item: {
      id: itemId,
      document_id: "doc_baking",
      /* Async approve: a transitional label, never asserted as "ready". */
      status: decision === "approved" ? "indexing" : "rejected",
    },
    decision,
  } satisfies ReviewDecisionResponse);

const failureJson = () =>
  HttpResponse.json(
    {
      error: {
        code: "internal_error",
        message: "The decision could not be recorded.",
        details: {},
      },
    },
    { status: 500 },
  );

const listIds = (client: QueryClient, key: (string | null)[]) =>
  (
    client.getQueryData(key) as ReviewListResponse | undefined
  )?.review_items.map((item) => item.id);

describe("review decisions", () => {
  it("approve removes the card before the POST resolves and sends decision=approved", async () => {
    const user = userEvent.setup();
    const gated = gatedDecision((itemId) => decidedJson(itemId, "approved"));
    server.use(gated.handler);
    renderReview();

    const { card } = await itemCard("Maple Cutout Cookies");
    await user.click(card.getByRole("button", { name: "Approve" }));

    /* Gone from the DOM while the response is still gated. */
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Maple Cutout Cookies" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(gated.bodies).toEqual([{ decision: "approved" }]),
    );
    expect(gated.itemIds).toEqual(["ki_maple_cutouts"]);
    expect(gated.isResolved()).toBe(false);

    /* Quiesce: release the response and let the settled refetch finish (the
       stateless base GET restores the fixture — server state is 4.4's). */
    gated.release();
    await screen.findByRole("heading", { name: "Maple Cutout Cookies" });
  });

  it("reject gates behind an inline confirm; Keep restores the actions with no request", async () => {
    const user = userEvent.setup();
    let postCount = 0;
    server.use(
      reviewDecisionHandler(reviewItemsFixture, () => {
        postCount += 1;
      }),
    );
    renderReview();

    const { card } = await itemCard("Maple Cutout Cookies");
    await user.click(card.getByRole("button", { name: "Reject" }));

    /* The actions row swapped in place for the confirm — no request yet. */
    expect(
      card.getByText(
        "Rejecting is permanent — recovery is reprocessing the whole book.",
      ),
    ).toBeInTheDocument();
    expect(
      card.getByRole("button", { name: "Reject item" }),
    ).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Keep" })).toBeInTheDocument();
    expect(
      card.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
    expect(
      card.queryByRole("button", { name: "Reject" }),
    ).not.toBeInTheDocument();
    expect(postCount).toBe(0);

    await user.click(card.getByRole("button", { name: "Keep" }));

    expect(card.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(card.queryByText(/Rejecting is permanent/)).not.toBeInTheDocument();
    expect(postCount).toBe(0);
  });

  it("Reject item POSTs decision=rejected and removes the card", async () => {
    const user = userEvent.setup();
    const decided = new Set<string>();
    const calls: [string, ReviewDecisionRequest][] = [];
    server.use(
      /* Stateful pair local to this test so the card STAYS gone through the
         settled refetch (paging is irrelevant at 5 fixtures). */
      http.get("/api/v1/review-items", () =>
        HttpResponse.json({
          review_items: reviewItemsFixture.filter(
            (item) => !decided.has(item.id),
          ),
        } satisfies ReviewListResponse),
      ),
      http.post(
        "/api/v1/knowledge-items/:itemId/review",
        async ({ params, request }) => {
          const itemId = String(params.itemId);
          const body = (await request.json()) as ReviewDecisionRequest;
          calls.push([itemId, body]);
          decided.add(itemId);
          return decidedJson(itemId, body.decision);
        },
      ),
    );
    renderReview();

    const { card } = await itemCard("Honey Oat Sandwich Loaf");
    await user.click(card.getByRole("button", { name: "Reject" }));
    await user.click(card.getByRole("button", { name: "Reject item" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Honey Oat Sandwich Loaf" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(calls).toEqual([["ki_honey_oat_loaf", { decision: "rejected" }]]),
    );
    /* The rest of the queue is untouched. */
    expect(
      screen.getByRole("heading", { name: "Maple Cutout Cookies" }),
    ).toBeInTheDocument();
  });

  it("a 500 rolls the card back with an inline alert; the rest of the list is untouched", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/v1/knowledge-items/:itemId/review", () => failureJson()),
    );
    renderReview();

    const { card } = await itemCard("Maple Cutout Cookies");
    await user.click(card.getByRole("button", { name: "Approve" }));

    /* The rollback re-renders the card — re-resolve the article node. */
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The decision could not be recorded.");
    const restored = await itemCard("Maple Cutout Cookies");
    expect(restored.card.getByRole("alert")).toBe(alert);
    for (const item of reviewItemsFixture) {
      expect(
        screen.getByRole("heading", { name: item.title }),
      ).toBeInTheDocument();
    }
  });

  it("a decided-elsewhere 404 rolls back with the envelope's message", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/v1/knowledge-items/:itemId/review", ({ params }) =>
        HttpResponse.json(
          reviewNotPendingEnvelope(String(params.itemId), "indexing"),
          { status: 404 },
        ),
      ),
    );
    renderReview();

    const { card } = await itemCard("Honey Oat Sandwich Loaf");
    await user.click(card.getByRole("button", { name: "Approve" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Knowledge item 'ki_honey_oat_loaf' is not awaiting review.",
    );
    const restored = await itemCard("Honey Oat Sandwich Loaf");
    expect(restored.card.getByRole("alert")).toBe(alert);
  });

  it("failure restores BOTH the unfiltered and filtered cache entries", async () => {
    const user = userEvent.setup();
    const gated = gatedDecision(() => failureJson());
    server.use(gated.handler);

    /* Seed BOTH entries — filtered and unfiltered can both hold the item. */
    const client = makeClient();
    client.setQueryData(["review-items", null], {
      review_items: reviewItemsFixture,
    } satisfies ReviewListResponse);
    client.setQueryData(["review-items", "doc_baking"], {
      review_items: reviewItemsFixture.filter(
        (item) => item.document.id === "doc_baking",
      ),
    } satisfies ReviewListResponse);
    renderReview(client);

    const { card } = await itemCard("Maple Cutout Cookies");
    await user.click(card.getByRole("button", { name: "Approve" }));

    /* Mid-flight (response still gated): optimistically gone from BOTH. */
    await waitFor(() =>
      expect(listIds(client, ["review-items", null])).not.toContain(
        "ki_maple_cutouts",
      ),
    );
    expect(listIds(client, ["review-items", "doc_baking"])).not.toContain(
      "ki_maple_cutouts",
    );

    gated.release();
    await screen.findByRole("alert");

    /* Rollback restored both snapshots — the INACTIVE filtered entry has no
       observer, so only the onError restore can have put the item back. */
    expect(listIds(client, ["review-items", null])).toContain(
      "ki_maple_cutouts",
    );
    expect(listIds(client, ["review-items", "doc_baking"])).toContain(
      "ki_maple_cutouts",
    );
  });

  it("a successful decision invalidates the seeded ['document', id] detail", async () => {
    const user = userEvent.setup();
    const client = makeClient();
    /* 4.2's idiom: exact invalidation refetches only ACTIVE observers, and
       the unfiltered queue mounts no useDocument — assert the state flag. */
    client.setQueryData(["document", "doc_baking"], { seeded: true });
    renderReview(client);

    const { card } = await itemCard("Maple Cutout Cookies");
    await user.click(card.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(
        client.getQueryState(["document", "doc_baking"])?.isInvalidated,
      ).toBe(true),
    );
  });
});
