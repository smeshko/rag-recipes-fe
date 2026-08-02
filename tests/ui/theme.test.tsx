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

  it("returns a stable snapshot reference", () => {
    expect(getThemeSnapshot()).toBe(getThemeSnapshot());

    setTheme("dark");
    const pinned = getThemeSnapshot();

    expect(getThemeSnapshot()).toBe(pinned);
  });
});
