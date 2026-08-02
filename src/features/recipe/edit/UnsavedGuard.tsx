import type { RefObject } from "react";
import { useCallback, useEffect, useId, useRef } from "react";
import { useBeforeUnload, useBlocker, useLocation } from "react-router";
import { Panel } from "../../../ui";

export interface UnsavedGuardProps {
  /** Live dirtiness from `useEditForm` — the whole condition for prompting. */
  isDirty: boolean;
  /**
   * `RecipeEditForm`'s discard latch (D22). Cancel raises it immediately
   * before `navigate()`, and the blocker reads it at navigation time so the
   * deliberate discard never prompts (D14).
   */
  discardingRef: RefObject<boolean>;
}

/**
 * "You have unsaved work" — as a panel in the app's own idiom, never the
 * browser's native confirm dialog (D15), which is unstylable, jsdom-hostile
 * and nothing like Sunday Kitchen. The grep that keeps it out of the codebase
 * is literal, so this comment does not spell the call.
 *
 * Mounted by `RecipeEditForm`, never by `RecipeEditPage`: both hooks below sit
 * unconditionally in the render body, and the page's four early returns would
 * make them conditional hook calls (D22).
 *
 * The predicate reads **everything at call time**. `discardingRef.current` is
 * dereferenced *inside* the callback rather than hoisted into a render-time
 * `armed` constant, because React Router registers the predicate in an effect
 * — the live closure holds whatever a hoisted value was at the last commit,
 * and Cancel sets the ref and navigates in one handler with no re-render in
 * between. A hoisted flag would still read `true` there and Cancel would
 * prompt, which is exactly what D14 forbids.
 */
export function UnsavedGuard({ isDirty, discardingRef }: UnsavedGuardProps) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      !discardingRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  /* Reload and tab-close, which `useBlocker` cannot see. The hook is
     unconditional and its effect always attaches the listener, so the dirty
     test lives inside the callback — there is no "register while dirty" and
     no listener to tear down when the form goes clean. */
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (isDirty) {
          event.preventDefault();
        }
      },
      [isDirty],
    ),
  );

  const location = useLocation();
  /* Re-arm. A settled location while this form is still mounted means the
     discard hop did not take the reviewer anywhere, and a latch left raised
     would silently disable the guard for the rest of the session. Safe to run
     on every settled location: the router evaluates the blocker synchronously
     inside `navigate()`, before React ever commits and runs this. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: location.key is the trigger, not an input — the effect lowers a latch each time a navigation settles while this form is still mounted, which is exactly what the key changing means.
  useEffect(() => {
    discardingRef.current = false;
  }, [location.key, discardingRef]);

  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const blocked = blocker.state === "blocked";

  useEffect(() => {
    if (blocked) {
      panelRef.current?.focus();
    }
  }, [blocked]);

  if (!blocked) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      role="alertdialog"
      aria-labelledby={headingId}
      tabIndex={-1}
      className="pt-8 outline-none"
    >
      <Panel className="border-danger-border bg-danger-fill">
        <p
          id={headingId}
          className="font-display text-[18px] font-semibold text-fg"
        >
          Discard your changes?
        </p>
        <p className="mt-1 text-[13.5px] text-fg-muted">
          Nothing has been saved yet.
        </p>
        <div className="mt-5 flex items-center gap-4">
          <button
            type="button"
            onClick={() => blocker.proceed?.()}
            className="rounded-pill bg-danger px-5 py-2 text-[13px] font-bold text-fg-on-accent"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => blocker.reset?.()}
            className="text-[12.5px] font-bold text-accent hover:underline"
          >
            Keep editing
          </button>
        </div>
      </Panel>
    </div>
  );
}
