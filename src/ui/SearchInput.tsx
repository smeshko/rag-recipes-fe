/* Controlled pill field — epic 02 phase 2.1 owns this extension of the 1.3
   primitive: the screen needs the live value for URL writes and 2.3's Ask
   flow, and controlled props make Back/Forward resync the caller's problem
   (one useEffect at the call site) instead of a reseed dance in here. Focus
   replaces the resting shadow with the deepened ring shadow (mockup :82). */
export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /* When present, the Ask button becomes the explicit answer trigger
     (type="button", no argument — the field is controlled, the parent owns
     the value) and Enter keeps firing onSubmit alone. Disabled on an empty
     trimmed value: the backend 400s an empty query, and an unguarded Ask
     would paint a danger notice on a virgin screen. */
  onAsk?: () => void;
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
  onAsk,
  placeholder = "What are we cooking?",
  label,
  ref,
}: SearchInputProps) {
  return (
    <form
      className="flex items-center gap-3.5 rounded-pill border border-line bg-card py-2 pr-2 pl-[26px] shadow-card transition-shadow duration-[250ms] focus-within:shadow-[0_14px_40px_rgba(94,74,44,0.14),0_0_0_4px_var(--color-apricot-soft)]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {/* Decorative: the placeholder and the Ask button carry the meaning, so
          the icon is hidden from the a11y tree. No <title> — aria-hidden
          prunes the subtree, so a title here would be unreachable markup
          implying an accessible name the icon does not have. */}
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px] flex-none stroke-apricot stroke-2"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        className="flex-1 border-none bg-transparent font-display text-[19px] text-ink outline-none"
      />
      <button
        type={onAsk ? "button" : "submit"}
        onClick={onAsk}
        disabled={onAsk ? value.trim() === "" : false}
        className="rounded-pill bg-apricot px-[26px] py-[13px] text-sm font-bold tracking-[0.02em] text-white transition-[background-color,transform] duration-[200ms] hover:bg-apricot-deep active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Ask
      </button>
    </form>
  );
}
