/**
 * Whether the rail is expanded, remembered across reloads.
 *
 * localStorage, not session: "I work with the rail collapsed" is a standing
 * preference about the chrome, the same kind of thing the theme is, and it
 * would be a strange one to have to re-state every morning. It is deliberately
 * NOT the drawer's state — below the 880px tier the rail is an overlay that
 * always starts closed, and persisting a drawer left open would greet a phone
 * with a panel over the page.
 *
 * Guarded like every other storage read here: a private window that throws on
 * access degrades to the default rather than taking the layout down with it.
 */
export const SIDEBAR_KEY = "sk:sidebar";

/** Expanded unless a stored preference says otherwise. */
export function readSidebarPreference(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "collapsed";
  } catch {
    return true;
  }
}

export function writeSidebarPreference(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, open ? "expanded" : "collapsed");
  } catch {
    /* Storage unavailable — the rail still collapses, it just forgets. */
  }
}
