import { IconSearch, IconSend } from "./icons";

/* The composer. Controlled: the screen needs the live value for URL writes and
   the AI actions strip, and controlled props make Back/Forward resync the
   caller's problem (one useEffect at the call site) instead of a reseed dance
   in here.
 *
 * Shaped like the target's composer — a fully rounded field, hairline border,
 * one whisper of shadow, and a SOLID CIRCULAR send button rather than a
 * labelled pill. The leading magnifier stays: this is a search field, not a
 * chat box, and the target's own search input carries one too.
 *
 * The button is icon-only but keeps the accessible name "Search". A voice
 * control user says "click Search"; nothing about the visible glyph changes
 * that, and WCAG 2.5.3 is satisfied because there is no competing visible
 * label to disagree with. */
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
  /** React 19 ref-as-prop for the inner input (focus/select from outside). */
  ref?: React.Ref<HTMLInputElement>;
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "What are we cooking?",
  label,
  ref,
}: SearchInputProps) {
  return (
    <form
      /* focus-within moves the border rather than adding a lift — depth is not
         how this language signals focus. The ring shadow rides along for the
         2px halo that keyboard users need; --shadow-focus is now just that
         halo, with none of the old 40px glow. */
      className="flex items-center gap-2.5 rounded-[26px] border border-border bg-surface-raised py-2 pr-2 pl-4 shadow-card transition-[border-color,box-shadow] duration-150 focus-within:border-fg-subtle focus-within:shadow-focus max-[560px]:gap-2 max-[560px]:pl-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {/* Decorative: the placeholder and the Search button carry the meaning,
          so the icon is hidden from the a11y tree (aria-hidden is baked into
          the icon set — see ui/icons.tsx). */}
      <IconSearch className="h-[18px] w-[18px] text-fg-subtle" />
      <input
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        /* 16px, not 15: iOS Safari zooms the viewport on focus for any input
           under 16px, and a composer is the one field on every screen. */
        className="min-w-0 flex-1 border-none bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-subtle pointer-coarse:min-h-11"
      />
      {/* Plain submit. The LLM actions (Ask the shelf, Compose a menu) live in
          the AI actions strip under the bar, not in the field: Enter and this
          button only ever run the plain search. */}
      <button
        type="submit"
        aria-label="Search"
        /* The black solid, and one of the few places it is spent. Hover
           lightens rather than darkens because in dark mode the same token is
           near-white — opacity is the one hover that reads correctly in both
           palettes without a `dark:` arm. */
        className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface-inverted text-fg-inverted transition-opacity duration-150 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <IconSend className="h-[18px] w-[18px]" />
      </button>
    </form>
  );
}
