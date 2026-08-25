import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";
import { aiAnswersTrigger, currentMode, modeTrigger } from "./composer";

/* The two LLM actions, which used to be a bordered "AI answers" strip of two
   buttons under the search bar and are now a menu inside the composer's footer
   row. What they DO is unchanged — see ask.test.tsx and menu.test.tsx, which
   still own the round-trip behaviour. This file owns the chrome: that the
   trigger is inside the field, that the empty-draft guard now lives on the
   trigger, and that both actions are reachable from it. */

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

describe("composer AI answers menu", () => {
  it("lives inside the composer, not in a strip beneath it", () => {
    renderAt("/");
    const form = searchBox().closest("form") as HTMLElement;
    expect(within(form).getByRole("button", { name: /^AI answers:/ })).toBe(
      aiAnswersTrigger(),
    );
    expect(within(form).getByRole("button", { name: /^Search mode:/ })).toBe(
      modeTrigger(),
    );
  });

  it("is disabled on the bare / and enables once there is a draft", async () => {
    const user = userEvent.setup();
    renderAt("/");
    expect(aiAnswersTrigger()).toBeDisabled();

    await user.type(searchBox(), "frittata");
    expect(aiAnswersTrigger()).toBeEnabled();

    await user.clear(searchBox());
    expect(aiAnswersTrigger()).toBeDisabled();
  });

  it("offers both actions, as actions rather than a setting", async () => {
    const user = userEvent.setup();
    renderAt("/?q=frittata");

    await user.click(aiAnswersTrigger());
    const menu = await screen.findByRole("menu", { name: "AI answers" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Ask the shelf"),
      expect.stringContaining("Compose a menu"),
    ]);
    /* menuitem, never menuitemradio: choosing one runs it. Nothing here is a
       mode that stays selected. */
    expect(within(menu).queryAllByRole("menuitemradio")).toHaveLength(0);
  });

  it("Escape closes the menu and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderAt("/?q=frittata");

    await user.click(aiAnswersTrigger());
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(aiAnswersTrigger()).toHaveFocus();
  });

  it("reports the search mode on its own trigger without opening", () => {
    renderAt("/?q=frittata&mode=vector");
    expect(currentMode()).toBe("Vector only");
  });

  it("the bar's own button is a plain Search, not an ask", () => {
    renderAt("/");
    const form = searchBox().closest("form") as HTMLElement;
    const button = within(form).getByRole("button", { name: "Search" });
    expect(button).toHaveAttribute("type", "submit");
  });
});
