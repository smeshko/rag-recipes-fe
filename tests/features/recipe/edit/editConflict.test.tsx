import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type { ErrorEnvelope } from "../../../../src/api";
import {
  editableItemsFixture,
  editScenario,
  ingestionAlreadyRunningEnvelope,
  knowledgeItemErrorHandler,
  knowledgeItemNotFoundEnvelope,
  reviewItemStaleEnvelope,
  reviewNotPendingEnvelope,
  unauthorizedEnvelope,
} from "../../../../src/mocks/knowledgeItems";
import { routes } from "../../../../src/routes";
import { needsReviewItemFixture } from "../../../msw/knowledgeItems";
import { server } from "../../../msw/server";

/* The conflict surface (5.4 TASK-007). Two triggers, one component: the page
   OBSERVING the item leave `needs_review` under an open draft, and the save
   the backend REFUSES with a code. Rendered through the real route table with
   `createMemoryRouter`, the idiom the rest of `edit/` uses — the claim under
   test is what a reviewer sees on the page they are still standing on. */

const ITEM_ID = "item_review";
const EDIT_PATH = `/recipes/${ITEM_ID}/edit`;
const SEEDED_TITLE = needsReviewItemFixture.knowledge_item.title;
const REPAIRED_TITLE = `${SEEDED_TITLE} (repaired)`;

/** The same item, as another tab's approval would leave it in the cache. */
const approvedInCache = {
  ...needsReviewItemFixture,
  knowledge_item: {
    ...needsReviewItemFixture.knowledge_item,
    status: "ready",
  },
};

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
const titleField = () => screen.getByLabelText("Title");

/** The one repair every case makes — enough to make the form dirty and the
    Save button live. */
async function repair(user: ReturnType<typeof userEvent.setup>) {
  await user.type(titleField(), " (repaired)");
}

/** Every arm's shared promise: the conflict is a message, never a teardown. */
function expectFormIntact() {
  expect(screen.getByTestId("recipe-edit-page")).toBeInTheDocument();
  expect(titleField()).toHaveValue(REPAIRED_TITLE);
  expect(
    screen.queryByText("This one's already on the shelf."),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("This item isn't waiting for review."),
  ).not.toBeInTheDocument();
}

describe("a status flip under an open draft", () => {
  it("warns before any save is attempted, and keeps the draft", async () => {
    const { user, queryClient } = await renderForm();
    await repair(user);

    act(() => {
      queryClient.setQueryData(["knowledge-item", ITEM_ID], approvedInCache);
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "This item is no longer waiting for review",
    );
    /* The item's ACTUAL status, through `statusTone` — not a generic line. */
    expect(alert).toHaveTextContent("it is now Ready");
    expect(alert).toHaveTextContent(
      "Your changes are still here, but saving them may be refused",
    );
    expectFormIntact();
  });

  it("leaves Save enabled, and swaps to the save-provoked copy when it is refused", async () => {
    const { user, queryClient, router } = await renderForm();
    await repair(user);

    act(() => {
      queryClient.setQueryData(["knowledge-item", ITEM_ID], approvedInCache);
    });
    await screen.findByRole("alert");

    /* The cached read is not the authority — the guarded UPDATE is. Taking
       the only control that could still rescue the work away would be a
       guess. */
    expect(saveButton()).toBeEnabled();

    server.use(
      knowledgeItemErrorHandler(404, knowledgeItemNotFoundEnvelope(ITEM_ID)),
    );
    await user.click(saveButton());

    expect(
      await screen.findByText("This item no longer exists."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no longer waiting for review/),
    ).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(EDIT_PATH);
    expectFormIntact();
  });
});

describe("a refused save", () => {
  const cases: [string, number, ErrorEnvelope, string][] = [
    [
      "review_not_pending",
      404,
      reviewNotPendingEnvelope(ITEM_ID, "ready"),
      "Someone has already decided this item, so your changes were not saved.",
    ],
    [
      "review_item_stale",
      409,
      reviewItemStaleEnvelope(ITEM_ID, 1, 2),
      "This book was reprocessed; this item belongs to an older extraction and can no longer be edited.",
    ],
    [
      "ingestion_already_running",
      409,
      ingestionAlreadyRunningEnvelope("doc_onepan", "extracting"),
      "This book is being reprocessed right now. Try again once it settles.",
    ],
    [
      "knowledge_item_not_found",
      404,
      knowledgeItemNotFoundEnvelope(ITEM_ID),
      "This item no longer exists.",
    ],
  ];

  it.each(cases)(
    "explains %s in the reviewer's own terms",
    async (_code, status, envelope, copy) => {
      server.use(knowledgeItemErrorHandler(status, envelope));
      const { user, router } = await renderForm();

      await repair(user);
      await user.click(saveButton());

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(copy);
      /* No backend sentence leaked through alongside the chosen copy. */
      expect(alert).not.toHaveTextContent(envelope.error.message);
      expect(router.state.location.pathname).toBe(EDIT_PATH);
      expectFormIntact();
    },
  );

  it("renders an unmodelled code's message verbatim", async () => {
    /* The house rule for backend-authored copy: a code this FE has no line
       for still says something true rather than something generic. */
    server.use(knowledgeItemErrorHandler(401, unauthorizedEnvelope));
    const { user } = await renderForm();

    await repair(user);
    await user.click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Authentication required.");
    expectFormIntact();
  });
});

describe("a failed approval after a committed save", () => {
  const APPROVE_ID = "item_edit_noingredients";
  const APPROVE_PATH = `/recipes/${APPROVE_ID}/edit`;
  const APPROVE_TITLE = "Maple Cutout Cookies";

  it("reads as saved-not-approved and never claims the save failed", async () => {
    server.use(...editScenario(editableItemsFixture));
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
    const { user, router, queryClient } = await renderForm(APPROVE_PATH);

    await user.type(screen.getByLabelText("Title"), " (repaired)");
    await user.click(screen.getByTestId("edit-save-approve"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Saved — but the approval failed: The queue is wedged.",
    );
    /* Nothing on screen calls the committed patch a failure. */
    expect(alert).not.toHaveTextContent("were not saved");
    expect(
      queryClient
        .getMutationCache()
        .getAll()
        .find(
          (mutation) =>
            mutation.options.scope?.id === `knowledge-item-${APPROVE_ID}`,
        )?.state.status,
    ).toBe("success");
    expect(router.state.location.pathname).toBe(APPROVE_PATH);
    expect(screen.getByTestId("recipe-edit-page")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue(
      `${APPROVE_TITLE} (repaired)`,
    );
  });
});
