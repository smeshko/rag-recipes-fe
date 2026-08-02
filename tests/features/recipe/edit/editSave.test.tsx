import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type {
  KnowledgeItemResponse,
  KnowledgeItemUpdateRequest,
  ReviewDecisionRequest,
  ReviewItem,
} from "../../../../src/api";
import {
  editableItemsFixture,
  editScenario,
  knowledgeItemErrorHandler,
} from "../../../../src/mocks/knowledgeItems";
import { reviewScenario } from "../../../../src/mocks/review";
import { routes } from "../../../../src/routes";
import { server } from "../../../msw/server";

/* Save, wired (5.4 TASK-003). Everything renders through the real route table
   with `createMemoryRouter` — the idiom the rest of `edit/` uses — because
   `/recipes/:id/edit` has to actually match, because `useBlocker` needs a data
   router, and because the claim under test is *where the reviewer ends up*. */

const ITEM_ID = "item_edit_noingredients";
const EDIT_PATH = `/recipes/${ITEM_ID}/edit`;
const READ_PATH = `/recipes/${ITEM_ID}`;
const SEEDED_TITLE = "Maple Cutout Cookies";
const CORRECTED_TITLE = `${SEEDED_TITLE} (repaired)`;
const NEW_INGREDIENT = "1 cup pure maple syrup";

/**
 * The stateful edit scenario, plus two gates that make the choreography
 * observable:
 *
 * - the PATCH gate records the body and then falls through (`undefined`) to
 *   the scenario's own handler, so the wire is asserted without replacing the
 *   real recomputation;
 * - the GET gate serves the pristine item until the patch lands and **hangs**
 *   after it. A background GET does fire on the read page's mount — `staleTime`
 *   is 0 — and that is by design; hanging it is what turns "the page is correct
 *   without waiting on the refetch" into something a test can fail. Anything
 *   the read page shows past this point came from the mutation's cache write.
 */
function wireEditServer({ patchDelay = 0 }: { patchDelay?: number } = {}) {
  const patchBodies: KnowledgeItemUpdateRequest[] = [];
  let sawPatch = false;
  let getsAfterPatch = 0;

  server.use(
    http.get("/api/v1/knowledge-items/:itemId", async () => {
      if (!sawPatch) {
        return undefined;
      }
      getsAfterPatch += 1;
      await delay("infinite");
    }),
    http.patch("/api/v1/knowledge-items/:itemId", async ({ request }) => {
      patchBodies.push(
        (await request.clone().json()) as KnowledgeItemUpdateRequest,
      );
      sawPatch = true;
      if (patchDelay > 0) {
        await delay(patchDelay);
      }
      return undefined;
    }),
    ...editScenario(editableItemsFixture),
  );

  return { patchBodies, getsAfterPatch: () => getsAfterPatch };
}

/** The read page's FIRST committed render, captured rather than awaited.
    `findBy*` only ever sees the settled DOM, so it cannot tell a page that was
    correct on mount from one that arrived early and filled in afterwards. */
function captureFirstPaint(container: HTMLElement) {
  let firstPaint: string | null = null;
  const observer = new MutationObserver(() => {
    if (firstPaint !== null) {
      return;
    }
    const page = container.querySelector('[data-testid="recipe-page"]');
    if (page) {
      firstPaint = page.textContent ?? "";
    }
  });
  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return {
    text: () => firstPaint,
    stop: () => observer.disconnect(),
  };
}

/**
 * What `['knowledge-item', id]` held at the instant the form decided to leave
 * — the invariant D4 exists to protect, pinned where it is decidable. A DOM
 * assertion cannot see it: `navigate` is async, so a cache write landing a
 * microtask late would still beat the read page's first commit.
 *
 * Measured against the installed query-core (5.101.4) while writing this: a
 * per-call `onSuccess` fires from `#dispatch({type:"success"})`, which
 * `mutation.js` reaches only AFTER awaiting the hook-level `onSettled` — so
 * the specific inversion D4 warns about is not observable in this version.
 * The seam is still the right place (see `RecipeEditForm`'s comment), and
 * this snapshot is what would catch any future reordering of the two.
 */
function snapshotCacheAtNavigate(
  router: ReturnType<typeof createMemoryRouter>,
  queryClient: QueryClient,
) {
  const snapshots: (KnowledgeItemResponse | undefined)[] = [];
  const original = router.navigate.bind(router) as (
    ...args: unknown[]
  ) => Promise<void>;
  router.navigate = ((...args: unknown[]) => {
    snapshots.push(
      queryClient.getQueryData<KnowledgeItemResponse>([
        "knowledge-item",
        ITEM_ID,
      ]),
    );
    return original(...args);
  }) as typeof router.navigate;
  return snapshots;
}

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

async function renderForm(path = EDIT_PATH) {
  const user = userEvent.setup();
  const utils = renderAt(path);
  await screen.findByTestId("recipe-edit-page");
  return { user, ...utils };
}

const saveButton = () => screen.getByTestId("edit-save");
const approveButton = () => screen.getByTestId("edit-save-approve");

describe("Save", () => {
  it("lands on the read page holding the server's refreshed item", async () => {
    const { getsAfterPatch } = wireEditServer();
    const { user, router, container, queryClient } = await renderForm();
    const paint = captureFirstPaint(container);
    const atNavigate = snapshotCacheAtNavigate(router, queryClient);

    await repair(user);
    await user.click(saveButton());

    expect(await screen.findByTestId("recipe-page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(READ_PATH);

    /* The read page mounts on the server's refreshed item, recomputed flags
       and all — `no_ingredients` is gone, the confidence flag an edit cannot
       clear survives. Nothing here waited on a refetch to become true.
       (TASK-005 is what puts these on screen.) */
    expect(atNavigate).toHaveLength(1);
    const landed = atNavigate[0]?.knowledge_item;
    expect(landed?.title).toBe(CORRECTED_TITLE);
    expect(landed?.edited_at).toEqual(expect.any(String));
    expect(landed?.review_reasons?.map((flag) => flag.code)).toEqual([
      "low_overall_confidence",
    ]);

    /* The first paint — not the settled DOM — already carries the patched
       title and the ingredient the reviewer typed, while the refetch this
       mount fired is still hanging. */
    const first = paint.text();
    paint.stop();
    expect(first).toContain(CORRECTED_TITLE);
    expect(first).toContain(NEW_INGREDIENT);
    expect(getsAfterPatch()).toBeGreaterThan(0);

    /* And it is still correct once everything settles. */
    expect(
      screen.getByRole("heading", { name: CORRECTED_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByText(NEW_INGREDIENT)).toBeInTheDocument();
  });

  it("forwards the return target one hop, like Cancel does", async () => {
    wireEditServer();
    const { user, router } = await renderForm(
      `${EDIT_PATH}?from=%2Freview%3Fdocument%3Dd1`,
    );

    await repair(user);
    await user.click(saveButton());

    expect(await screen.findByTestId("recipe-page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(READ_PATH);
    expect(router.state.location.search).toBe(
      "?from=%2Freview%3Fdocument%3Dd1",
    );
    expect(
      await screen.findByRole("link", { name: "← Back to review queue" }),
    ).toHaveAttribute("href", "/review?document=d1");
  });

  it("sends only the keys the reviewer changed", async () => {
    const { patchBodies } = wireEditServer();
    const { user } = await renderForm();

    await repair(user);
    await user.click(saveButton());
    await screen.findByTestId("recipe-page");

    expect(patchBodies).toHaveLength(1);
    /* `patchBody()`'s output verbatim: the two dirty keys and nothing else —
       no `summary`, no untouched timings, no `steps`. */
    expect(patchBodies[0]).toEqual({
      title: CORRECTED_TITLE,
      ingredients: [NEW_INGREDIENT],
    });
  });

  it("never asks to discard the changes it just saved", async () => {
    /* The D7 latch. A successful save does NOT make `useEditForm` clean — it
       compares against the seed snapshot, which the save never moves — so
       without `discardingRef` the blocker prompts on the happy path. */
    wireEditServer();
    const { user } = await renderForm();

    await repair(user);
    await user.click(saveButton());

    expect(await screen.findByTestId("recipe-page")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-page")).not.toBeInTheDocument();
  });

  it("is disabled on a clean form, on an emptied title, and while in flight", async () => {
    wireEditServer({ patchDelay: 60 });
    const { user } = await renderForm();

    expect(saveButton()).toBeDisabled();

    await repair(user);
    expect(saveButton()).toBeEnabled();

    await user.clear(screen.getByLabelText("Title"));
    expect(saveButton()).toBeDisabled();

    await user.type(screen.getByLabelText("Title"), CORRECTED_TITLE);
    expect(saveButton()).toBeEnabled();

    await user.click(saveButton());
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent("Saving…");

    expect(await screen.findByTestId("recipe-page")).toBeInTheDocument();
  });

  it("keeps the reviewer on the form and announces a failed save", async () => {
    wireEditServer();
    server.use(
      knowledgeItemErrorHandler(500, {
        error: {
          code: "internal_error",
          message: "The stove hiccuped.",
          details: {},
        },
      }),
    );
    const { user, router } = await renderForm();

    await repair(user);
    await user.click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The stove hiccuped.");
    expect(router.state.location.pathname).toBe(EDIT_PATH);
    expect(screen.getByTestId("recipe-edit-page")).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-page")).not.toBeInTheDocument();
    /* Their work is still in front of them, and still saveable. */
    expect(screen.getByLabelText("Title")).toHaveValue(CORRECTED_TITLE);
    expect(screen.getByLabelText("Ingredient 1")).toHaveValue(NEW_INGREDIENT);
    expect(saveButton()).toBeEnabled();
  });
});

/* ---------- Save & approve (TASK-004) ---------- */

const QUEUE_DOCUMENT = "doc_baking";
const OTHER_QUEUE_TITLE = "Stovetop Skillet Granola";

/** A queue row for a given item id. The shared review fixtures are keyed
    `ki_*` and none of them is the item this form edits, so "the card left the
    queue" would be vacuously true against them. */
const queueRow = (id: string, title: string): ReviewItem => ({
  id,
  title,
  summary: null,
  item_type: "recipe",
  document: { id: QUEUE_DOCUMENT, title: "bakingwithlesssugar" },
  source_pages: { page_start: 41, page_end: 43 },
  extraction: {
    schema: "recipe.v1",
    yield: null,
    top_ingredients: [],
    confidence_overall: null,
  },
  flags: [
    { code: "no_ingredients", message: "No ingredients were extracted." },
  ],
});

/** The edited item plus one bystander, so the queue that renders after the
    approve is provably a rendered queue and not an empty state. */
const QUEUE_ROWS = [
  queueRow(ITEM_ID, SEEDED_TITLE),
  queueRow("ki_skillet_granola", OTHER_QUEUE_TITLE),
];

const PATCH_LINE = `PATCH /api/v1/knowledge-items/${ITEM_ID}`;
const DECIDE_LINE = `POST /api/v1/knowledge-items/${ITEM_ID}/review`;

/** Every request the suite makes, in order, as `METHOD /path`. The ordering
    claim ("patch, THEN decide") and the abort claim ("no decision at all")
    are both statements about the wire, so they are asserted on the wire —
    a rendered message can be right for the wrong reason. */
function recordRequests() {
  const log: string[] = [];
  server.events.on("request:start", ({ request }) => {
    log.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return {
    all: () => log,
    decisions: () =>
      log.filter((line) => line === PATCH_LINE || line === DECIDE_LINE),
  };
}

afterEach(() => {
  server.events.removeAllListeners();
});

/**
 * `wireEditServer` plus a stateful review queue holding the edited item, and
 * a pass-through gate that records the decision bodies. Registered AFTER the
 * scenario because `server.use` prepends: the gate must be reached first, and
 * it returns `undefined` so the scenario still answers.
 */
function wireApproveServer(options: { patchDelay?: number } = {}) {
  const edit = wireEditServer(options);
  const decisions: ReviewDecisionRequest[] = [];
  server.use(...reviewScenario(QUEUE_ROWS));
  server.use(
    http.post("/api/v1/knowledge-items/:itemId/review", async ({ request }) => {
      decisions.push((await request.clone().json()) as ReviewDecisionRequest);
      return undefined;
    }),
  );
  return { ...edit, decisions };
}

/** The update mutation's own state, read from the cache rather than inferred
    from the DOM: "the committed save is still reported as a success" is a
    claim about `update.status`, and the seam isolation D8 buys is exactly the
    thing a rendered message would fail to distinguish. */
function updateStatus(queryClient: QueryClient) {
  return queryClient
    .getMutationCache()
    .getAll()
    .find(
      (mutation) => mutation.options.scope?.id === `knowledge-item-${ITEM_ID}`,
    )?.state.status;
}

describe("Save & approve", () => {
  it("patches, then approves, then lands on a queue without the card", async () => {
    const log = recordRequests();
    const { decisions } = wireApproveServer();
    const { user, router } = await renderForm(`${EDIT_PATH}?from=%2Freview`);

    await repair(user);
    await user.click(approveButton());

    expect(await screen.findByText(OTHER_QUEUE_TITLE)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/review");
    /* The card the reviewer just repaired has left the queue. */
    expect(screen.queryByText(SEEDED_TITLE)).not.toBeInTheDocument();

    /* One patch, one decision, in that order. */
    expect(log.decisions()).toEqual([PATCH_LINE, DECIDE_LINE]);
    expect(decisions).toEqual([{ decision: "approved" }]);

    /* And no prompt to discard the changes the approve just committed. */
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  });

  it("never reaches the decision when the patch fails", async () => {
    const log = recordRequests();
    const { decisions } = wireApproveServer();
    server.use(
      knowledgeItemErrorHandler(500, {
        error: {
          code: "internal_error",
          message: "The stove hiccuped.",
          details: {},
        },
      }),
    );
    const { user, router } = await renderForm(`${EDIT_PATH}?from=%2Freview`);

    await repair(user);
    await user.click(approveButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The stove hiccuped.");
    expect(router.state.location.pathname).toBe(EDIT_PATH);
    expect(screen.getByTestId("recipe-edit-page")).toBeInTheDocument();

    /* The whole recorded log, not a filtered view: an approve that leaked
       through on ANY path would show up here. */
    expect(log.all()).toEqual([
      `GET /api/v1/knowledge-items/${ITEM_ID}`,
      PATCH_LINE,
    ]);
    expect(decisions).toEqual([]);
  });

  it("keeps the committed save when the approval fails", async () => {
    wireApproveServer();
    server.use(
      http.post("/api/v1/knowledge-items/:itemId/review", () =>
        HttpResponse.json(
          {
            error: {
              code: "internal_error",
              message: "The queue is wedged.",
              details: {},
            },
          },
          { status: 500 },
        ),
      ),
    );
    const { user, router, queryClient } = await renderForm(
      `${EDIT_PATH}?from=%2Freview`,
    );

    await repair(user);
    await user.click(approveButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Saved — but the approval failed: The queue is wedged.",
    );
    expect(router.state.location.pathname).toBe(EDIT_PATH);

    /* The seam-isolation guarantee: the PATCH committed, so the mutation is
       still a success and nothing on screen calls the save failed. */
    expect(updateStatus(queryClient)).toBe("success");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(
      queryClient.getQueryData<KnowledgeItemResponse>([
        "knowledge-item",
        ITEM_ID,
      ])?.knowledge_item.title,
    ).toBe(CORRECTED_TITLE);
  });

  it("returns to the filtered queue the reviewer came from", async () => {
    wireApproveServer();
    const { user, router } = await renderForm(
      `${EDIT_PATH}?from=%2Freview%3Fdocument%3D${QUEUE_DOCUMENT}`,
    );

    await repair(user);
    await user.click(approveButton());

    expect(await screen.findByText(OTHER_QUEUE_TITLE)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/review");
    expect(router.state.location.search).toBe(`?document=${QUEUE_DOCUMENT}`);
  });

  it("does not steal the navigation of a reviewer who left mid-flight", async () => {
    /* The seam is a HOOK-level callback, so query-core runs it even after this
       form has unmounted, and `useNavigate` keeps working off an unmounted
       component. Cancel is not disabled while the patch is in flight, so
       without the mounted latch the reviewer lands on the read page and is
       then thrown to /review a moment later (review #1.1). */
    const { decisions } = wireApproveServer({ patchDelay: 80 });
    const { user, router } = await renderForm(`${EDIT_PATH}?from=%2Freview`);

    await repair(user);
    await user.click(approveButton());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(router.state.location.pathname).toBe(READ_PATH);

    /* The act they asked for still completes — only the navigation is
       dropped. */
    await waitFor(() => expect(decisions).toEqual([{ decision: "approved" }]));
    expect(router.state.location.pathname).toBe(READ_PATH);
  });

  it("raises no conflict banner on a save that worked", async () => {
    /* The proactive banner's exact precondition: the form is still dirty (D7)
       and the item has left `needs_review`. The only thing keeping "Someone
       has already decided this item" off a save that WORKED is that
       `useReviewDecision`'s settle does not invalidate ['knowledge-item', id]
       — a property of another module, pinned here. */
    wireApproveServer();
    const { user, queryClient } = await renderForm(
      `${EDIT_PATH}?from=%2Freview`,
    );

    await repair(user);
    await user.click(approveButton());

    expect(await screen.findByText(OTHER_QUEUE_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      queryClient.getQueryState(["knowledge-item", ITEM_ID])?.isInvalidated,
    ).toBe(false);
  });
});

/** The one repair every case makes: name the recipe and give it the
    ingredients it was flagged for not having. */
async function repair(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Title"), " (repaired)");
  await user.type(screen.getByLabelText("Ingredient 1"), NEW_INGREDIENT);
}
