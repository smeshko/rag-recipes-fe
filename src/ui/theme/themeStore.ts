import { useSyncExternalStore } from "react";

/**
 * The theme, held as a *choice* and a *resolved* value: `system` is a standing
 * instruction to follow the OS, not a third palette, so the store subscribes to
 * `prefers-color-scheme` and retracks live — an OS flip re-themes the open app
 * with no reload and nothing mounted.
 *
 * `localStorage`, not `sessionStorage`: `lastSearch.ts` is per-tab on purpose,
 * a theme must outlive the tab. The two keys share the `sk:` prefix.
 *
 * The DOM stamp lives here rather than in a component so it happens on every
 * real change from one place, and `ThemeToggle` stays a pure renderer of the
 * snapshot. It fires inside `recompute()` and never on import — a test that
 * merely imports this module has not changed the document.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "sk:theme";

export interface ThemeState {
  readonly choice: ThemeChoice;
  readonly resolved: ResolvedTheme;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/* The page wash per palette. index.html's pre-paint script writes the same two
   hexes before any stylesheet exists, so these are a synced pair — change one,
   change the other. They are the only colours outside theme.css. */
const PAGE_COLOR: Record<ResolvedTheme, string> = {
  light: "#FBF7EF",
  dark: "#16110C",
};

/* Every storage access is guarded: localStorage can throw (private windows,
   storage disabled), and remembering a theme is never worth an error — a
   failure degrades to following the OS, exactly like a first visit. */

function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    /* Validated, not cast: a hand-edited "purple" degrades to the OS rather
       than becoming a data-theme nothing paints. */
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    /* Unreadable storage — the theme follows the OS for this visit. */
    return "system";
  }
}

function writeStoredChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* Unwritable storage — the choice holds until the page is reloaded. */
  }
}

function prefersDark(): boolean {
  /* jsdom implements no matchMedia, and neither does every embedded webview —
     absent means "no dark preference expressed", not a crash. */
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(DARK_QUERY).matches;
}

function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") {
    return prefersDark() ? "dark" : "light";
  }
  return choice;
}

function stamp(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  root.style.backgroundColor = PAGE_COLOR[resolved];
}

/* `useSyncExternalStore` calls getSnapshot on every render and bails out only
   on an Object.is match, so the snapshot is a frozen object held in a module
   variable and replaced only on a real change. A fresh object per call is an
   infinite render loop. Built lazily on first read, never at module scope. */
let snapshot: ThemeState | null = null;

const SERVER_SNAPSHOT: ThemeState = Object.freeze({
  choice: "system",
  resolved: "light",
} satisfies ThemeState);

function recompute(choice: ThemeChoice): ThemeState {
  const resolved = resolveTheme(choice);
  const previous = snapshot;
  if (
    previous !== null &&
    previous.choice === choice &&
    previous.resolved === resolved
  ) {
    return previous;
  }
  snapshot = Object.freeze({ choice, resolved });
  if (previous?.resolved !== resolved) {
    stamp(resolved);
  }
  return snapshot;
}

const listeners = new Set<() => void>();
let mediaList: MediaQueryList | null = null;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function handleMediaChange(): void {
  const before = getThemeSnapshot();
  if (before.choice !== "system") {
    /* A pinned choice does not follow the OS. */
    return;
  }
  if (recompute(before.choice) !== before) {
    notify();
  }
}

/* One ref-counted subscription rather than one per subscriber: the first
   listener attaches the MediaQueryList handler, the last one detaches it, so
   nothing is left listening once the app unmounts. */
function attachMediaListener(): void {
  if (typeof window.matchMedia !== "function") {
    return;
  }
  mediaList = window.matchMedia(DARK_QUERY);
  mediaList.addEventListener("change", handleMediaChange);
}

function detachMediaListener(): void {
  mediaList?.removeEventListener("change", handleMediaChange);
  mediaList = null;
}

export function subscribeTheme(listener: () => void): () => void {
  if (listeners.size === 0) {
    attachMediaListener();
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      detachMediaListener();
    }
  };
}

export function getThemeSnapshot(): ThemeState {
  return snapshot ?? recompute(readStoredChoice());
}

/* A module-level constant so a renderToString — in a future SSR or in a test —
   cannot trip the hook's server-snapshot stability check. */
export function getThemeServerSnapshot(): ThemeState {
  return SERVER_SNAPSHOT;
}

export function setTheme(choice: ThemeChoice): void {
  const before = getThemeSnapshot();
  writeStoredChoice(choice);
  if (recompute(choice) !== before) {
    notify();
  }
}

export function useTheme(): ThemeState {
  return useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );
}

/** Test-only: drop the cached snapshot and every listener so the next read
 * re-reads storage and the environment, without `vi.resetModules()`. */
export function resetThemeStoreForTests(): void {
  snapshot = null;
  listeners.clear();
  detachMediaListener();
}
