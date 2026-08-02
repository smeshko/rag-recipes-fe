import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../../../src/routes";

/* The unsaved-changes guard and the action row (5.3 TASK-006). Everything
   renders through the real route table with `createMemoryRouter`, because
   `useBlocker` throws outside a data router and because the whole point of
   these assertions is *where the router actually ended up* — `router.state.
   location`, not merely which copy is on screen. */

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
  return { ...utils, router };
}

async function renderForm(path = "/recipes/item_review/edit") {
  const user = userEvent.setup();
  const utils = renderAt(path);
  await screen.findByTestId("recipe-edit-page");
  return { user, ...utils };
}

const saveButton = () => screen.getByTestId("edit-save");
const cancelButton = () => screen.getByRole("button", { name: "Cancel" });
const prompt = () => screen.queryByRole("alertdialog");

describe("the action row", () => {
  it("starts with Save disabled and Cancel present", async () => {
    await renderForm();

    expect(saveButton()).toBeDisabled();
    expect(cancelButton()).toBeInTheDocument();
  });

  it("enables Save once the form is dirty, and disables it again when the title is cleared", async () => {
    const { user } = await renderForm();

    expect(saveButton()).toBeDisabled();

    await user.type(screen.getByLabelText("Ingredient 2"), " and thyme");
    expect(saveButton()).toBeEnabled();

    /* Dirty but invalid — TASK-003's one client-side rule, asserted here on
       the control it actually gates. */
    await user.clear(screen.getByLabelText("Title"));
    expect(saveButton()).toBeDisabled();

    await user.type(screen.getByLabelText("Title"), "A repaired title");
    expect(saveButton()).toBeEnabled();
  });
});

describe("the unsaved-changes guard", () => {
  it("lets an untouched form leave by the back link with no prompt", async () => {
    const { user, router } = await renderForm();

    await user.click(screen.getByRole("link", { name: /back to cook/i }));

    expect(router.state.location.pathname).toBe("/");
    expect(prompt()).not.toBeInTheDocument();
  });

  it("blocks the back link once a field is edited and stays on the edit route", async () => {
    const { user, router } = await renderForm();

    await user.type(screen.getByLabelText("Title"), " (repaired)");
    await user.click(screen.getByRole("link", { name: /back to cook/i }));

    expect(prompt()).toBeInTheDocument();
    expect(screen.getByText("Discard your changes?")).toBeInTheDocument();
    expect(screen.getByText("Nothing has been saved yet.")).toBeInTheDocument();
    /* The navigation did not happen: the router is still on the form. */
    expect(router.state.location.pathname).toBe("/recipes/item_review/edit");
  });

  it("dismisses the prompt on Keep editing and keeps the typing", async () => {
    const { user, router } = await renderForm();

    await user.type(screen.getByLabelText("Title"), " (repaired)");
    await user.click(screen.getByRole("link", { name: /back to cook/i }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(prompt()).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/recipes/item_review/edit");
    expect(screen.getByLabelText("Title")).toHaveValue(
      "Spinach and Cheddar Frittata (repaired)",
    );
  });

  it("completes the original navigation on Discard", async () => {
    const { user, router } = await renderForm();

    await user.type(screen.getByLabelText("Title"), " (repaired)");
    await user.click(screen.getByRole("link", { name: /back to cook/i }));
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(router.state.location.pathname).toBe("/");
    expect(prompt()).not.toBeInTheDocument();
  });

  it("is keyboard-operable — both buttons tab-reachable and Enter-activated", async () => {
    const { user, router } = await renderForm();

    await user.type(screen.getByLabelText("Title"), " (repaired)");
    await user.click(screen.getByRole("link", { name: /back to cook/i }));

    /* Focus moves to the panel when it appears, so a keyboard reviewer is not
       left behind on the link that is no longer there to be pressed. */
    expect(prompt()).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Discard" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(prompt()).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/recipes/item_review/edit");

    await user.click(screen.getByRole("link", { name: /back to cook/i }));
    await user.tab();
    await user.keyboard("{Enter}");
    expect(router.state.location.pathname).toBe("/");
  });

  it("blocks a reload while dirty and lets a clean form go", async () => {
    const { user } = await renderForm();

    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText("Title"), " (repaired)");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

describe("Cancel", () => {
  it("discards without prompting and lands on the recipe", async () => {
    const { user, router } = await renderForm();

    await user.type(screen.getByLabelText("Title"), " (repaired)");
    await user.click(cancelButton());

    /* The assertion that catches a blocker armed from a render-time value:
       Cancel sets the ref and navigates in one handler with no re-render in
       between, so a hoisted `armed` constant would still read `true` here and
       the prompt would appear. */
    expect(router.state.location.pathname).toBe("/recipes/item_review");
    expect(prompt()).not.toBeInTheDocument();
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  });

  it("forwards the validated return target one hop down", async () => {
    const { user, router } = await renderForm(
      "/recipes/item_review/edit?from=%2Freview%3Fdocument%3Dd1",
    );

    await user.click(cancelButton());

    expect(router.state.location.pathname).toBe("/recipes/item_review");
    expect(router.state.location.search).toBe(
      "?from=%2Freview%3Fdocument%3Dd1",
    );
    /* The point of forwarding: the recipe's own back link still points where
       the reviewer actually came from. */
    expect(
      await screen.findByRole("link", { name: "← Back to review queue" }),
    ).toHaveAttribute("href", "/review?document=d1");
  });

  it("lands on the bare recipe when there is no return target", async () => {
    const { user, router } = await renderForm();

    await user.click(cancelButton());

    expect(router.state.location.pathname).toBe("/recipes/item_review");
    expect(router.state.location.search).toBe("");
  });

  it("drops a hostile from rather than forwarding it", async () => {
    const { user, router } = await renderForm(
      "/recipes/item_review/edit?from=%2F%2Fevil.com",
    );

    await user.click(cancelButton());

    expect(router.state.location.pathname).toBe("/recipes/item_review");
    expect(router.state.location.search).toBe("");
  });
});
