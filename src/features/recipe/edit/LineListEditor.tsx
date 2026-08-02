import { useCallback, useLayoutEffect, useRef } from "react";
import type { LineRow } from "./useEditForm";

/** Which element of a row a pending focus is aiming at. Only these three ever
    receive focus: the remove button always destroys its own row, so it can
    never be the destination. */
type RowSlot = "text" | "up" | "down";

type PendingFocus = { rowId: string; slot: RowSlot } | { rowId: null };

/** Where focus goes when the preferred slot is disabled — see the layout
    effect. The text field is last and always live, so every chain terminates. */
const FOCUS_FALLBACKS: Record<RowSlot, readonly RowSlot[]> = {
  text: ["text"],
  up: ["up", "down", "text"],
  down: ["down", "up", "text"],
};

/** The DOM nodes one row registers, keyed in the editor's map by the row's
    synthetic id — never by index, because the ids are what survive a reorder
    (D4) and the index is exactly what a move changes. */
type RowNodes = Partial<Record<RowSlot, HTMLElement>>;

type Register = (id: string, slot: RowSlot, el: HTMLElement | null) => void;

export interface LineListEditorProps {
  rows: LineRow[];
  onChange: (rows: LineRow[]) => void;
  newRow: () => LineRow;
  /** "ingredient" | "step" — drives every accessible name. */
  noun: string;
  /** Steps render the apricot ordinal; ingredients render nothing. */
  ordered?: boolean;
  addLabel: string;
}

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

/**
 * The one line-list editor both panels drive: a row per line with an
 * auto-growing textarea, an Add button, and per-row remove / move-up /
 * move-down controls that are real, labelled, keyboard-reachable buttons.
 *
 * Fully controlled — it holds no row state of its own, only the DOM
 * bookkeeping that focus management needs. Every accessible name is derived
 * from `noun` plus render position, so the ingredient and step panels share
 * one naming rule rather than inventing two.
 */
export function LineListEditor({
  rows,
  onChange,
  newRow,
  noun,
  ordered = false,
  addLabel,
}: LineListEditorProps) {
  const nodes = useRef(new Map<string, RowNodes>());
  const addRef = useRef<HTMLButtonElement>(null);
  /* Where focus must land after the *parent* has re-rendered with the new
     rows. It cannot be done inline in the handler: the destination either
     does not exist yet (Add) or has moved (a reorder). */
  const pendingFocus = useRef<PendingFocus | null>(null);

  const register = useCallback<Register>((id, slot, el) => {
    const map = nodes.current;
    const entry = map.get(id) ?? {};
    if (el) {
      entry[slot] = el;
      map.set(id, entry);
      return;
    }
    /* React calls the ref back with null when the row unmounts, which is what
       keeps the map from retaining detached nodes for removed rows. */
    delete entry[slot];
    if (Object.keys(entry).length === 0) {
      map.delete(id);
    }
  }, []);

  /* No dependency array on purpose: the effect must run after *every* commit,
     because a pending focus is set during a render this component does not
     control the inputs of. It is a layout effect so focus lands before paint,
     and it clears the request so a later unrelated render cannot re-fire it. */
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) {
      return;
    }
    pendingFocus.current = null;
    if (pending.rowId === null) {
      addRef.current?.focus();
      return;
    }
    const entry = nodes.current.get(pending.rowId);
    if (!entry) {
      return;
    }
    /* The end of a travel disables the very button that carried the row there
       — a row at the top has no ↑ — and `focus()` on a disabled control is a
       silent no-op that strands the keyboard on `document.body`. So the
       destination is a preference, not an address: the button that was
       pressed, else the arrow pointing the other way, else the row's own
       field. Chromium reproduces the stranding; jsdom does too. */
    for (const slot of FOCUS_FALLBACKS[pending.slot]) {
      const el = entry[slot];
      if (el && !(el as Partial<HTMLButtonElement>).disabled) {
        el.focus();
        return;
      }
    }
  });

  const setText = (index: number, text: string) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, text } : row)));
  };

  const add = () => {
    const row = newRow();
    /* Focus the row that does not exist yet — by id, which is why the ids are
       minted by the caller rather than derived here. */
    pendingFocus.current = { rowId: row.id, slot: "text" };
    onChange([...rows, row]);
  };

  const move = (index: number, delta: -1 | 1) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + delta, 0, row);
    /* The same button, following its row to the new index — so a repeated ↑
       keeps travelling instead of stranding focus on the body after the
       first press (D17). */
    pendingFocus.current = {
      rowId: row.id,
      slot: delta === -1 ? "up" : "down",
    };
    onChange(next);
  };

  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    /* The row that slid into the gap, or the one above it if the removed row
       was last, or the Add button when nothing is left to focus. */
    const neighbour = next[index] ?? next[index - 1];
    pendingFocus.current = neighbour
      ? { rowId: neighbour.id, slot: "text" }
      : { rowId: null };
    onChange(next);
  };

  const List = ordered ? "ol" : "ul";

  return (
    <>
      <List className="mt-4 flex flex-col gap-2.5">
        {rows.map((row, index) => (
          <Row
            key={row.id}
            row={row}
            index={index}
            count={rows.length}
            noun={noun}
            ordered={ordered}
            register={register}
            onText={setText}
            onMove={move}
            onRemove={remove}
          />
        ))}
      </List>
      <button
        type="button"
        ref={addRef}
        onClick={add}
        className="mt-3 w-full rounded-[10px] border border-border-strong border-dashed py-2 text-[13px] font-bold text-accent hover:bg-accent-fill"
      >
        {addLabel}
      </button>
    </>
  );
}

const controlClass =
  "text-[13px] font-bold text-fg-subtle hover:text-accent disabled:cursor-default disabled:opacity-40";

interface RowProps {
  row: LineRow;
  index: number;
  count: number;
  noun: string;
  ordered: boolean;
  register: Register;
  onText: (index: number, text: string) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
}

/**
 * One `<li>`. It exists because a row carries per-row hooks — the auto-grow
 * layout effect and the ref callback that registers its nodes — and hooks
 * cannot be called inside a `.map()`. It holds no state of its own beyond
 * its DOM node: every value it renders comes from props.
 */
function Row({
  row,
  index,
  count,
  noun,
  ordered,
  register,
  onText,
  onMove,
  onRemove,
}: RowProps) {
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const position = index + 1;

  const setTextNode = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textRef.current = el;
      register(row.id, "text", el);
    },
    [register, row.id],
  );

  const setUpNode = useCallback(
    (el: HTMLButtonElement | null) => {
      register(row.id, "up", el);
    },
    [register, row.id],
  );

  const setDownNode = useCallback(
    (el: HTMLButtonElement | null) => {
      register(row.id, "down", el);
    },
    [register, row.id],
  );

  /* Auto-grow: reset to `auto` first, or scrollHeight only ever reports the
     height the box already has and the field can never shrink again. A layout
     effect, not an effect, so the reflow lands before paint. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: row.text is the trigger, not an input — the effect measures the DOM after React has written the new value into it, so re-measuring on every change is the whole point.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    /* jsdom (and any display:none ancestor) reports 0 — pinning the field to
       0px there would hide it, so the measurement only counts when real. */
    if (el.scrollHeight > 0) {
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [row.text]);

  return (
    /* The track list follows the cell count, because an unordered row renders
       no ordinal: with three tracks and two children the textarea would land
       in the leading `auto` track and size to its own text, leaving `w-full`
       to mean "as wide as this line happens to be". */
    <li
      className={`grid items-start gap-2 ${
        ordered ? "grid-cols-[auto_1fr_auto]" : "grid-cols-[1fr_auto]"
      }`}
    >
      {ordered ? (
        /* Derived from render position, never stored — a reorder renumbers by
           construction. */
        <span className="mt-2 w-[26px] font-display text-[17px] font-semibold text-accent italic">
          {position}.
        </span>
      ) : null}
      <textarea
        ref={setTextNode}
        rows={1}
        aria-label={`${capitalize(noun)} ${position}`}
        value={row.text}
        onChange={(event) => onText(index, event.target.value)}
        /* text-base on phones: under 16px, iOS zooms the viewport on focus,
           and these textareas are what a reviewer actually types into. The
           auto-grow layout effect re-measures on every change, so the larger
           face just means a taller box, not a clipped one. */
        className="w-full resize-none rounded-[10px] border border-border bg-surface-inset px-3 py-2 text-[14px] leading-[1.5] text-fg max-[560px]:text-base focus:border-accent focus:shadow-focus focus:outline-none"
      />
      <span className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          ref={setUpNode}
          disabled={index === 0}
          aria-label={`Move ${noun} ${position} up`}
          onClick={() => onMove(index, -1)}
          className={controlClass}
        >
          ↑
        </button>
        <button
          type="button"
          ref={setDownNode}
          disabled={index === count - 1}
          aria-label={`Move ${noun} ${position} down`}
          onClick={() => onMove(index, 1)}
          className={controlClass}
        >
          ↓
        </button>
        <button
          type="button"
          aria-label={`Remove ${noun} ${position}`}
          onClick={() => onRemove(index)}
          className={controlClass}
        >
          ×
        </button>
      </span>
    </li>
  );
}
