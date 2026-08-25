import type { ReactNode } from "react";
import { IconSend } from "./icons";

/* The composer. Controlled: the screen needs the live value for URL writes and
   for the actions in the footer, and controlled props make Back/Forward resync
   the caller's problem (one useEffect at the call site) instead of a reseed
   dance in here.
 *
 * Geometry read off chatgpt.com rather than guessed (2026-08-25): 28px radius,
 * a 768px column, 16px/26px text. It is a TWO-ROW box — the field on top, a
 * row of quiet controls beneath it — which is the shape every current AI
 * composer has converged on (theirs, Grok's, Gemini's, Cursor's). The second
 * row is what lets the expensive actions live inside the field instead of in a
 * bordered strip underneath it.
 *
 * 16px on the input, not 15: iOS Safari zooms the viewport on focus for any
 * input under 16px, and this is the one field on every screen.
 *
 * No leading magnifier any more. It was a holdover from when this was only a
 * search box; with a control row spelling out what the box does, an icon
 * repeating "search" is noise. */
export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  /** Accessible name override. Defaults to the placeholder: the placeholder is
      the field's only visible prompt, and WCAG 2.5.3 (Label in Name) wants the
      announced name to contain the visible text, so a voice-control user can
      say what they see. Overriding it with unrelated wording breaks that. */
  label?: string;
  /** The footer row's left side — menus, toggles. Rendered inside the box, so
      whatever goes here is visually part of the field. */
  controls?: ReactNode;
  /** Accessible name for the submit button. Defaults to "Search". */
  submitLabel?: string;
  /** React 19 ref-as-prop for the inner input (focus/select from outside). */
  ref?: React.Ref<HTMLInputElement>;
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "What are we cooking?",
  label,
  controls,
  submitLabel = "Search",
  ref,
}: SearchInputProps) {
  return (
    <form
      /* ONE row, controls inline to the right of the field — measured off the
         target, whose composer is ~56px tall with its model picker, mic and
         send button all on the same line as the placeholder. A two-row box
         (which Cursor and Gemini use) came out at 88px here and read as a
         panel rather than a field.

         It wraps on the phone tier instead of shrinking: at 375px the field,
         two menus and the button do not fit on one line, and squeezing them
         leaves nothing to type into. Wrapped, the input takes the first row
         and the controls the second — `ml-auto` on the button then does real
         work, holding it to the right edge of that second row.

         focus-within moves the border rather than adding a lift — depth is not
         how this language signals focus. The ring shadow rides along for the
         2px halo keyboard users need. */
      className="flex items-center gap-1.5 rounded-[28px] border border-border bg-surface-raised px-2 py-2 shadow-card transition-[border-color,box-shadow] duration-150 focus-within:border-fg-subtle focus-within:shadow-focus max-[560px]:flex-wrap"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        /* min-w-0 so a long draft shrinks the field rather than pushing the
           controls out of the box. */
        className="min-w-0 flex-1 border-none bg-transparent px-2 text-[16px] leading-[26px] text-fg outline-none placeholder:text-fg-subtle max-[560px]:basis-full max-[560px]:pb-1"
      />
      {controls}
      <button
        type="submit"
        aria-label={submitLabel}
        /* Blue, not the black solid — the one place the target spends a
             coloured fill, and the reason --color-accent-solid exists. White
             glyph on #3a83f7 is 3.64:1, over the 3:1 a non-text control needs.
             Hover fades rather than darkening so the single value works in
             both themes without a `dark:` arm. */
        className="ml-auto grid h-9 w-9 flex-none place-items-center rounded-full bg-accent-solid text-white transition-opacity duration-150 hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <IconSend className="h-[18px] w-[18px]" />
      </button>
    </form>
  );
}
