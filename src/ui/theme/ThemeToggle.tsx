import type { KeyboardEvent, ReactElement } from "react";
import { useRef } from "react";
import { setTheme, type ThemeChoice, useTheme } from "./themeStore";

/**
 * The three-way theme control: light, dark, system.
 *
 * An APG radiogroup rather than three toggle buttons — the choices are
 * mutually exclusive, and a radiogroup gets "1 of 3" announced for free.
 * `role="tablist"` would be a lie (nothing here is a tab panel) and three
 * independent `aria-pressed` buttons lose the exclusivity.
 *
 * It announces the **choice**, never the resolved palette: with `system`
 * selected on a dark OS, System stays checked and `<html>` says dark. Checking
 * Dark instead would make the control unable to express "follow the OS".
 *
 * Pure renderer of the store snapshot — no local state, no effect. The DOM
 * stamping lives in `themeStore`, so an OS flip re-themes the document whether
 * or not this component re-renders.
 */

interface Segment {
  readonly value: ThemeChoice;
  readonly label: string;
  readonly Icon: () => ReactElement;
}

/* Decorative glyphs: the button's aria-label carries the name, so the subtree
   is pruned from the a11y tree. No <title> — inside an aria-hidden subtree it
   would be unreachable markup, the same reasoning SearchInput documents. */
const ICON_CLASS = "h-4 w-4 stroke-current stroke-2";

function SunIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      className={ICON_CLASS}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 2.5v2.25M12 19.25v2.25M4.22 4.22l1.6 1.6M18.18 18.18l1.6 1.6M2.5 12h2.25M19.25 12h2.25M4.22 19.78l1.6-1.6M18.18 5.82l1.6-1.6" />
    </svg>
  );
}

function MoonIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      className={ICON_CLASS}
      fill="none"
      aria-hidden="true"
    >
      <path d="M20.5 14.6A8.6 8.6 0 019.4 3.5a8.6 8.6 0 1011.1 11.1z" />
    </svg>
  );
}

function MonitorIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      className={ICON_CLASS}
      fill="none"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </svg>
  );
}

/* One list, so the arrow-key maths is index arithmetic rather than three
   branches — and the rendered order is the keyboard order by construction. */
const SEGMENTS: readonly Segment[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

/* Icon-only segments, so they need a floor on BOTH axes — 30x30 at rest.
   grid place-items-center keeps the icon centred once the box grows.

   The selected segment is a RAISED pill, not the inverted black one: this
   control lives in the sidebar footer, and the black solid is spoken for by
   primary actions (send, save, upload). A white pill with a hairline on the
   rail's grey is the platform-standard segmented-control idiom and is what the
   target uses. Both states carry a border so selecting one shifts nothing. */
const SEGMENT_BASE =
  "grid place-items-center rounded-pill border p-[7px] transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11";

function segmentClass(selected: boolean): string {
  return selected
    ? `${SEGMENT_BASE} border-border bg-surface-raised text-fg`
    : `${SEGMENT_BASE} border-transparent text-fg-subtle hover:text-fg`;
}

export function ThemeToggle() {
  const { choice } = useTheme();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  /* APG: in a radiogroup the arrow keys move selection *and* focus together,
     so there is no "focused but unselected" state to reconcile. */
  function select(index: number): void {
    const segment = SEGMENTS[index];
    if (segment === undefined) {
      return;
    }
    setTheme(segment.value);
    buttons.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const current = SEGMENTS.findIndex((segment) => segment.value === choice);
    const last = SEGMENTS.length - 1;
    let next: number;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = current === last ? 0 : current + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = current <= 0 ? last : current - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        /* Space and Enter fall through to the button's own click. */
        return;
    }

    /* Stops the arrow keys scrolling the page under the header. */
    event.preventDefault();
    select(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={handleKeyDown}
      className="inline-flex items-center gap-0.5 rounded-pill border border-border bg-surface-inset p-0.5"
    >
      {SEGMENTS.map(({ value, label, Icon }, index) => (
        // biome-ignore lint/a11y/useSemanticElements: <input type="radio"> would have to be visually hidden behind a styled <label> to carry the pill fill, which is more markup and a less honest control than the APG button pattern this file implements.
        <button
          key={value}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={choice === value}
          aria-label={label}
          /* Roving tabindex: the group is a single tab stop, and Tab lands on
             whichever segment is currently selected. */
          tabIndex={choice === value ? 0 : -1}
          onClick={() => select(index)}
          className={segmentClass(choice === value)}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
