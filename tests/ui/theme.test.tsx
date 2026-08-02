import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "../../src/ui/theme/ThemeToggle";
import {
  getThemeSnapshot,
  resetThemeStoreForTests,
  setTheme,
  subscribeTheme,
  THEME_KEY,
} from "../../src/ui/theme/themeStore";
import { installMatchMedia, type MatchMediaHandle } from "../matchMedia";

/* The store is a module singleton, so every test starts from a blank one:
   storage cleared, cached snapshot dropped, a fresh light-reporting
   matchMedia installed over the default `tests/setup.ts` one. A test that
   wants a dark OS installs its own handle on top and resets again. */

let media: MatchMediaHandle;

beforeEach(() => {
  localStorage.clear();
  media = installMatchMedia(false);
  resetThemeStoreForTests();
});

afterEach(() => {
  resetThemeStoreForTests();
  media.restore();
});

describe("theme store", () => {
  it("defaults to system and resolves light", () => {
    expect(getThemeSnapshot()).toEqual({ choice: "system", resolved: "light" });
  });

  it("resolves dark when the OS prefers dark", () => {
    media.restore();
    media = installMatchMedia(true);
    resetThemeStoreForTests();

    expect(getThemeSnapshot()).toEqual({ choice: "system", resolved: "dark" });
  });

  it("setTheme pins the choice, persists it and stamps <html>", () => {
    const listener = vi.fn();
    subscribeTheme(listener);

    setTheme("dark");

    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(getThemeSnapshot()).toEqual({ choice: "dark", resolved: "dark" });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    /* jsdom normalises the #16110C the pre-paint script also writes. */
    expect(document.documentElement.style.backgroundColor).toBe(
      "rgb(22, 17, 12)",
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("an OS flip retracks a system choice", () => {
    const listener = vi.fn();
    subscribeTheme(listener);
    expect(getThemeSnapshot().resolved).toBe("light");

    media.setMatches(true);

    expect(getThemeSnapshot()).toEqual({ choice: "system", resolved: "dark" });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("an OS flip leaves a pinned choice alone", () => {
    setTheme("light");
    const listener = vi.fn();
    subscribeTheme(listener);

    media.setMatches(true);

    expect(getThemeSnapshot()).toEqual({ choice: "light", resolved: "light" });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(listener).not.toHaveBeenCalled();
  });

  it("degrades to system when storage throws or holds garbage", () => {
    localStorage.setItem(THEME_KEY, "purple");
    resetThemeStoreForTests();
    expect(getThemeSnapshot()).toEqual({ choice: "system", resolved: "light" });

    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    resetThemeStoreForTests();
    expect(() => getThemeSnapshot()).not.toThrow();
    expect(getThemeSnapshot()).toEqual({ choice: "system", resolved: "light" });
    getItem.mockRestore();

    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    expect(() => setTheme("dark")).not.toThrow();
    setItem.mockRestore();

    resetThemeStoreForTests();
    expect(getThemeSnapshot()).toEqual({ choice: "system", resolved: "light" });
  });

  it("re-reads the OS when a subscriber returns after a gap", () => {
    /* With nobody subscribed the `change` handler is detached (D9), so the
       store is blind: the snapshot it cached before the gap is whatever the OS
       said then. useSyncExternalStore re-reads getSnapshot straight after
       subscribing to catch exactly this, so the re-attach must re-resolve. */
    const unsubscribe = subscribeTheme(vi.fn());
    expect(getThemeSnapshot().resolved).toBe("light");
    unsubscribe();

    media.setMatches(true);

    /* Blind, as designed — nothing observed the flip. */
    expect(getThemeSnapshot().resolved).toBe("light");

    subscribeTheme(vi.fn());

    expect(getThemeSnapshot()).toEqual({ choice: "system", resolved: "dark" });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("returns a stable snapshot reference", () => {
    expect(getThemeSnapshot()).toBe(getThemeSnapshot());

    setTheme("dark");
    const pinned = getThemeSnapshot();

    expect(getThemeSnapshot()).toBe(pinned);
  });
});

/* The control announces the *choice*, so every assertion below is on
   aria-checked over the three names — never on the resolved palette. */
function segments(): HTMLElement[] {
  const group = screen.getByRole("radiogroup", { name: "Theme" });
  return within(group).getAllByRole("radio");
}

function names(): (string | null)[] {
  return segments().map((segment) => segment.getAttribute("aria-label"));
}

function radio(name: string): HTMLElement {
  return screen.getByRole("radio", { name });
}

describe("theme toggle", () => {
  it("renders three named segments in light, dark, system order", () => {
    render(<ThemeToggle />);

    expect(names()).toEqual(["Light", "Dark", "System"]);
    expect(radio("System")).toBeChecked();
  });

  it("clicking a segment pins the choice, persists it and stamps <html>", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(radio("Dark"));

    expect(radio("Dark")).toBeChecked();
    expect(radio("System")).not.toBeChecked();
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(radio("System"));

    expect(radio("System")).toBeChecked();
    expect(localStorage.getItem(THEME_KEY)).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");

    /* Back on the OS leash: the fake matchMedia flips and the document
       follows without another click. */
    act(() => media.setMatches(true));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("announces the choice, not the resolution: system stays checked on a dark OS", () => {
    media.restore();
    media = installMatchMedia(true);
    resetThemeStoreForTests();

    render(<ThemeToggle />);

    expect(radio("System")).toBeChecked();
    expect(radio("Dark")).not.toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("is a single tab stop and moves selection and focus with the arrows", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    /* Roving tabindex: only the checked segment is reachable by Tab. */
    expect(
      segments().map((segment) => segment.getAttribute("tabindex")),
    ).toEqual(["-1", "-1", "0"]);

    await user.tab();
    expect(radio("System")).toHaveFocus();

    /* Wraps forwards off the end … */
    await user.keyboard("{ArrowRight}");
    expect(radio("Light")).toHaveFocus();
    expect(radio("Light")).toBeChecked();

    /* … and backwards off the start. */
    await user.keyboard("{ArrowLeft}");
    expect(radio("System")).toHaveFocus();
    expect(radio("System")).toBeChecked();

    await user.keyboard("{ArrowDown}");
    expect(radio("Light")).toBeChecked();
    await user.keyboard("{ArrowUp}");
    expect(radio("System")).toBeChecked();

    await user.keyboard("{Home}");
    expect(radio("Light")).toHaveFocus();
    expect(radio("Light")).toBeChecked();

    await user.keyboard("{End}");
    expect(radio("System")).toHaveFocus();
    expect(radio("System")).toBeChecked();

    /* One stop in, one stop out. */
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it("selects the focused segment with Space and Enter", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    radio("Dark").focus();
    await user.keyboard(" ");
    expect(radio("Dark")).toBeChecked();

    radio("Light").focus();
    await user.keyboard("{Enter}");
    expect(radio("Light")).toBeChecked();
  });
});
