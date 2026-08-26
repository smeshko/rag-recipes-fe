import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";
import { server } from "../msw/server";
import {
  actionTrigger,
  chooseAction,
  currentAction,
  currentMode,
  modeTrigger,
  submitButton,
} from "./composer";

/* The composer's Action selector: Search / Ask the shelf / Compose a menu,
   one always chosen, nothing fired until submit.
 *
 * This file owns that CONTRACT — the selector's shape and the choose-then-run
 * split. What each action actually fetches stays in ask.test.tsx,
 * menu.test.tsx and searchpage.test.tsx. */

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

const searchBox = () =>
  screen.getByRole("textbox", { name: "What are we cooking?" });

/* Counts every request the page makes, so "nothing fired" is an assertion
   about the network rather than about the DOM. */
let calls: string[] = [];
beforeEach(() => {
  calls = [];
  server.use(
    http.post("/api/v1/search", () =>
      HttpResponse.json({ results: [], total: 0 }),
    ),
  );
  server.events.on("request:start", ({ request }) => {
    calls.push(new URL(request.url).pathname);
  });
});

describe("composer action selector", () => {
  it("lives inside the composer, beside the mode menu", () => {
    renderAt("/");
    const form = searchBox().closest("form") as HTMLElement;
    expect(within(form).getByRole("button", { name: /^Action:/ })).toBe(
      actionTrigger(),
    );
    expect(within(form).getByRole("button", { name: /^Search mode:/ })).toBe(
      modeTrigger(),
    );
    expect(within(form).getByRole("button", { name: /^Search$/ })).toBe(
      submitButton(),
    );
  });

  it("defaults to Search and offers all three as one exclusive set", async () => {
    const user = userEvent.setup();
    renderAt("/?q=frittata");
    expect(currentAction()).toBe("Search");

    await user.click(actionTrigger());
    const menu = await screen.findByRole("menu", { name: "Action" });
    /* menuitemradio, never menuitem: these are a setting with one member
       checked, not a list of things that run when clicked. */
    expect(within(menu).queryAllByRole("menuitem")).toHaveLength(0);
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Search"),
      expect.stringContaining("Ask the shelf"),
      expect.stringContaining("Compose a menu"),
    ]);
    expect(
      items.filter((i) => i.getAttribute("aria-checked") === "true"),
    ).toHaveLength(1);
  });

  /* The whole point of the redesign: selecting is free. */
  it("fires nothing when an action is chosen", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.type(searchBox(), "frittata");
    calls = [];

    await chooseAction(user, "Ask the shelf");
    expect(currentAction()).toBe("Ask the shelf");
    await chooseAction(user, "Compose a menu");
    expect(currentAction()).toBe("Compose a menu");

    expect(calls).toEqual([]);
  });

  it("fires nothing when a mode is chosen", async () => {
    const user = userEvent.setup();
    renderAt("/?q=frittata");
    await screen.findByText(/matches|Nothing on the shelf/i).catch(() => null);
    calls = [];

    await user.click(modeTrigger());
    await user.click(
      await screen.findByRole("menuitemradio", { name: /^Vector only/ }),
    );

    expect(currentMode()).toBe("Vector only");
    expect(calls).toEqual([]);
  });

  /* The submit button is the only thing that runs anything, so it has to say
     which of the three it will run. */
  it("names the submit button after the chosen action", async () => {
    const user = userEvent.setup();
    renderAt("/?q=frittata");
    expect(submitButton()).toHaveAccessibleName("Search");

    await chooseAction(user, "Ask the shelf");
    expect(submitButton()).toHaveAccessibleName("Ask the shelf");

    await chooseAction(user, "Compose a menu");
    expect(submitButton()).toHaveAccessibleName("Compose a menu");
  });

  it("Escape closes the menu and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderAt("/?q=frittata");

    await user.click(actionTrigger());
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(actionTrigger()).toHaveFocus();
  });

  it("restores the action from the URL on a deep load", () => {
    renderAt("/?q=frittata&asked=1");
    expect(currentAction()).toBe("Ask the shelf");
    expect(submitButton()).toHaveAccessibleName("Ask the shelf");
  });

  it("reports the search mode on its own trigger without opening", () => {
    renderAt("/?q=frittata&mode=vector");
    expect(currentMode()).toBe("Vector only");
  });
});
