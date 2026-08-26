import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { IconChevronDown } from "./icons";

/* The small ghost dropdown that lives in the composer's footer row.
 *
 * This is the target's `Medium ⌄` control, and the same shape Grok, Gemini and
 * Cursor all use: a quiet trigger inside the input box, opening a menu of
 * options with descriptions. It exists so the expensive controls — the LLM
 * actions and the retrieval mode — stop occupying a bordered strip of their
 * own under the field. A search bar should look like a search bar; the things
 * that change what a round-trip does live one click inside it.
 *
 * A SETTINGS MENU, ONLY. Every item is a `menuitemradio` with exactly one
 * checked: picking one changes what the next submit will do, and nothing here
 * ever fires a request itself. The first cut also had an "action" flavour
 * (`menuitem`s that ran on selection); `ComposerControls` records why that
 * was reversed — the menus decide WHAT, the send button decides WHEN.
 *
 * Opens DOWNWARD, and right-aligned to its trigger. Both choices are about
 * where this composer actually sits, which is not where the target's does:
 * theirs is pinned to the bottom of a scrolling thread, so its menus open up.
 * Ours is top-anchored under the greeting — an upward menu ran straight off
 * the top of the viewport and was clipped. Right-aligned because both triggers
 * live in the right half of the field; `left-0` would push a 300px menu past
 * the right edge. A trigger on the LEFT of a field would want the opposite,
 * so make this a prop before using it there. */

export interface ComposerMenuItem {
  /** Stable key, and the value reported to onSelect. */
  key: string;
  label: string;
  /** The second line, as the target's own model menu has. */
  description?: string;
  icon?: ReactNode;
  /** Exactly one item in the list should be checked. */
  checked: boolean;
  disabled?: boolean;
}

export interface ComposerMenuProps {
  /** Accessible name for the trigger, e.g. "Search mode". The visible label is
      the current value, so the name has to say what the value IS. */
  label: string;
  /** Visible trigger text. */
  value: string;
  icon?: ReactNode;
  items: readonly ComposerMenuItem[];
  onSelect: (key: string) => void;
  disabled?: boolean;
  /** Marks the trigger busy while the action it launched is in flight. */
  busy?: boolean;
}

export function ComposerMenu({
  label,
  value,
  icon,
  items,
  onSelect,
  disabled = false,
  busy = false,
}: ComposerMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  /* Close on any pointer press outside the whole control — trigger included,
     so a second click on the trigger toggles rather than closing-then-
     reopening. `mousedown`, not `click`: a click on another button should
     close this menu before that button's own handler runs. */
  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  /* Focus lands on the first item when the menu opens, which is what makes it
     operable from the keyboard at all — without it, Tab would walk past the
     open menu into the send button. */
  useEffect(() => {
    if (open) {
      itemRefs.current[0]?.focus();
    }
  }, [open]);

  function close(refocus: boolean): void {
    setOpen(false);
    if (refocus) {
      triggerRef.current?.focus();
    }
  }

  function moveFocus(from: number, delta: number): void {
    const last = items.length - 1;
    let next = from + delta;
    if (next < 0) {
      next = last;
    }
    if (next > last) {
      next = 0;
    }
    itemRefs.current[next]?.focus();
  }

  function onItemKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(index, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(index, -1);
        break;
      case "Home":
        event.preventDefault();
        itemRefs.current[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        itemRefs.current[items.length - 1]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        /* Let focus leave, but do not leave an orphaned menu open behind it. */
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-busy={busy ? true : undefined}
        /* The name is "<what it sets>: <what it is set to>" so a screen reader
           announces the current value without the visible text having to
           repeat the category. */
        aria-label={`${label}: ${value}`}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            return;
          }
          /* Escape has to work HERE too, not just on an item: if the first
             item is disabled it never takes focus when the menu opens, so the
             keypress is still on the trigger and the menu would otherwise be
             unclosable from the keyboard. */
          if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-[13px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent pointer-coarse:min-h-11"
      >
        {icon}
        {value}
        <IconChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute top-full right-0 z-40 mt-2 w-[300px] max-w-[calc(100vw-2rem)] rounded-[14px] border border-border bg-surface-raised p-1.5 shadow-menu"
        >
          {items.map((item, index) => {
            return (
              <button
                key={item.key}
                ref={(node: HTMLButtonElement | null) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={item.checked}
                disabled={item.disabled}
                onKeyDown={(event: React.KeyboardEvent<HTMLButtonElement>) =>
                  onItemKeyDown(event, index)
                }
                onClick={() => {
                  /* Close BEFORE the handler runs: a selection may move focus
                     (the field refocuses) and reopening the trigger afterwards
                     would steal it back. */
                  close(false);
                  onSelect(item.key);
                }}
                className="flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent pointer-coarse:min-h-11"
              >
                {item.icon ? (
                  <span className="mt-0.5 flex-none text-fg-muted">
                    {item.icon}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] text-fg">
                    {item.label}
                  </span>
                  {item.description ? (
                    <span className="block text-[12.5px] text-fg-subtle">
                      {item.description}
                    </span>
                  ) : null}
                </span>
                {/* The tick. aria-checked already carries this for assistive
                    tech, so it is decorative. */}
                {item.checked ? (
                  <span aria-hidden="true" className="mt-0.5 flex-none text-fg">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
