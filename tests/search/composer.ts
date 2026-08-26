import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

/* Helpers for the composer's two footer menus.
 *
 * THE INTERACTION MODEL CHANGED, and these helpers exist to keep that change
 * in one file rather than in forty call sites. It used to be one step: the two
 * LLM actions were buttons, and clicking one ran it. It is now two:
 *
 *     choose  — pick Search / Ask the shelf / Compose a menu from the Action
 *               menu. Nothing is fetched. Same for the retrieval mode.
 *     submit  — press the send button (or Enter). Exactly one thing runs, and
 *               it is whatever was chosen.
 *
 * So `runAiAction` is choose-then-submit, and `chooseAction` / `chooseMode`
 * are the halves for tests that need to assert nothing fired.
 *
 * The submit button's accessible name IS the selected action, which is why
 * `submitButton` matches an anchored alternation: "Action: Search" (the menu
 * trigger) and "Search Matching recipes from your shelf" (the open menu item)
 * both contain the word and neither is the button. */

type User = ReturnType<typeof userEvent.setup>;

export const actionTrigger = () =>
  screen.getByRole("button", { name: /^Action:/ });

export const modeTrigger = () =>
  screen.getByRole("button", { name: /^Search mode:/ });

export const submitButton = () =>
  screen.getByRole("button", {
    name: /^(Search|Ask the shelf|Compose a menu)$/,
  });

/** The action the composer currently reports, e.g. "Ask the shelf". */
export function currentAction(): string {
  const label = actionTrigger().getAttribute("aria-label") ?? "";
  return label.replace(/^Action: /, "");
}

/** The mode the composer currently reports, e.g. "Hybrid". */
export function currentMode(): string {
  const label = modeTrigger().getAttribute("aria-label") ?? "";
  return label.replace(/^Search mode: /, "");
}

/* Names are matched by prefix regex, not exactly: a menu item renders its
   label AND a description line, and the accessible name is both concatenated. */

/** Pick an action. Fetches nothing — submit is what runs it. */
export async function chooseAction(user: User, name: string): Promise<void> {
  await user.click(actionTrigger());
  await user.click(
    await screen.findByRole("menuitemradio", { name: new RegExp(`^${name}`) }),
  );
}

/** Pick a retrieval mode. Fetches nothing. */
export async function chooseMode(user: User, name: string): Promise<void> {
  await user.click(modeTrigger());
  await user.click(
    await screen.findByRole("menuitemradio", { name: new RegExp(`^${name}`) }),
  );
}

/** Choose an action and run it — the old one-click behaviour, in two steps. */
export async function runAiAction(user: User, name: string): Promise<void> {
  await chooseAction(user, name);
  await user.click(submitButton());
}

/** Choose a mode and run the currently-selected action with it. */
export async function runWithMode(user: User, name: string): Promise<void> {
  await chooseMode(user, name);
  await user.click(submitButton());
}
