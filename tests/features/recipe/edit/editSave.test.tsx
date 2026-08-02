import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type {
  KnowledgeItemResponse,
  KnowledgeItemUpdateRequest,
} from "../../../../src/api";
import {
  editableItemsFixture,
  editScenario,
  knowledgeItemErrorHandler,
} from "../../../../src/mocks/knowledgeItems";
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

/** The one repair every case makes: name the recipe and give it the
    ingredients it was flagged for not having. */
async function repair(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Title"), " (repaired)");
  await user.type(screen.getByLabelText("Ingredient 1"), NEW_INGREDIENT);
}

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
