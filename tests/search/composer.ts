import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

/* Helpers for the composer's two footer menus.
 *
 * The two LLM actions and the three search modes used to be five always-
 * visible buttons under the search bar; they now live in dropdowns inside the
 * field (see src/features/search/ComposerControls.tsx). What each control DOES
 * is unchanged — choosing "Ask the shelf" still fires the ask, choosing a mode
 * still re-runs the search — so every test that asserted those behaviours kept
 * its assertions and only had to learn to open the menu first. That opening is
 * what these helpers encapsulate, in one place, so the next chrome change is a
 * three-line edit rather than a forty-site sweep.
 *
 * Names are matched by prefix regex, not exactly: a menu item renders its
 * label AND a description line, and the accessible name is the concatenation
 * of both. */

type User = ReturnType<typeof userEvent.setup>;

export const aiAnswersTrigger = () =>
  screen.getByRole("button", { name: /^AI answers:/ });

export const modeTrigger = () =>
  screen.getByRole("button", { name: /^Search mode:/ });

/** The mode the composer currently reports, e.g. "Hybrid". */
export function currentMode(): string {
  const label = modeTrigger().getAttribute("aria-label") ?? "";
  return label.replace(/^Search mode: /, "");
}

/** Open the AI answers menu and run one of its actions. */
export async function runAiAction(user: User, name: string): Promise<void> {
  await user.click(aiAnswersTrigger());
  await user.click(
    await screen.findByRole("menuitem", { name: new RegExp(`^${name}`) }),
  );
}

/** Open the search-mode menu and pick a mode. */
export async function chooseMode(user: User, name: string): Promise<void> {
  await user.click(modeTrigger());
  await user.click(
    await screen.findByRole("menuitemradio", { name: new RegExp(`^${name}`) }),
  );
}
