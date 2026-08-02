/**
 * A controllable `window.matchMedia`.
 *
 * jsdom implements none at all — the property is simply absent, so the first
 * `prefers-color-scheme` read throws `window.matchMedia is not a function`.
 * This is therefore not a convenience wrapper over a partial implementation,
 * it is the only `matchMedia` the suite has, and `tests/setup.ts` installs a
 * default one for every test.
 *
 * Controllable on purpose: "the OS theme flipped while the app was open" is
 * only testable if a test can dispatch the `change` event itself, so the
 * handle's `setMatches` updates every list this install has issued and fires
 * `change` on each.
 */

export interface MatchMediaHandle {
  /** Flip the media state and notify every listener on every issued list. */
  setMatches(next: boolean): void;
  /** Put `window.matchMedia` back the way it was found. */
  restore(): void;
}

/* jsdom ships no `MediaQueryListEvent` constructor either, so the event a
   listener receives is an `Event` that carries the two fields the interface
   promises. */
class FakeMediaQueryListEvent extends Event {
  readonly matches: boolean;
  readonly media: string;

  constructor(media: string, matches: boolean) {
    super("change");
    this.media = media;
    this.matches = matches;
  }
}

class FakeMediaQueryList extends EventTarget {
  matches: boolean;
  readonly media: string;
  onchange:
    | ((this: MediaQueryList, event: MediaQueryListEvent) => unknown)
    | null = null;

  constructor(media: string, matches: boolean) {
    super();
    this.media = media;
    this.matches = matches;
  }

  /* The pre-2018 listener shape. Nothing here uses it, but code that
     feature-detects `addListener` before `addEventListener` must find a
     callable rather than fall through to a throw. */
  addListener(): void {}
  removeListener(): void {}
}

export function installMatchMedia(initialMatches: boolean): MatchMediaHandle {
  const original = Object.getOwnPropertyDescriptor(window, "matchMedia");
  const issued: FakeMediaQueryList[] = [];
  let matches = initialMatches;

  window.matchMedia = (query: string): MediaQueryList => {
    const list = new FakeMediaQueryList(query, matches);
    issued.push(list);
    return list;
  };

  return {
    setMatches(next: boolean): void {
      matches = next;
      for (const list of issued) {
        list.matches = next;
        const event = new FakeMediaQueryListEvent(list.media, next);
        list.dispatchEvent(event);
        list.onchange?.call(list, event);
      }
    },
    restore(): void {
      if (original === undefined) {
        Reflect.deleteProperty(window, "matchMedia");
        return;
      }
      Object.defineProperty(window, "matchMedia", original);
    },
  };
}
