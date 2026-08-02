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
  /* Ask is in flight. Disables the button so a second click cannot buy a
     second LLM round-trip. Only meaningful alongside onAsk; the plain
     submit-button path ignores it. */
  asking?: boolean;
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
  asking = false,
  placeholder = "What are we cooking?",
  label,
  ref,
}: SearchInputProps) {
  return (
    <form
      /* The pill's chrome is fixed-width and the input is the only flexible
         part, so every px of gutter comes straight out of the typing area:
         at 375px the desktop values leave it under 200px. The phone tier
         trims the left gutter and the inner gaps rather than the button,
         which has to stay legible. */
      className="flex items-center gap-3.5 rounded-pill border border-border bg-surface-raised py-2 pr-2 pl-[26px] shadow-card transition-shadow duration-[250ms] focus-within:shadow-focus max-[560px]:gap-2.5 max-[560px]:pl-4"
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
        className="h-[18px] w-[18px] flex-none stroke-accent stroke-2"
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
        className="flex-1 border-none bg-transparent font-display text-[19px] text-fg outline-none"
      />
      <button
        type={onAsk ? "button" : "submit"}
        onClick={onAsk}
        disabled={onAsk ? value.trim() === "" || asking : false}
        aria-busy={onAsk && asking ? true : undefined}
        /* accent-strong, not accent: `fg-on-accent` on light `accent`
           measures 3.61:1 — the one light contrast failure phase 5.6's
           criteria name. On `accent-strong` it is 4.63:1, hovering to
           `accent-pressed` at 5.97:1. Theme-agnostic on purpose (no `dark:`
           arm): in dark the same pair reads 10.05:1 hovering to 6.35:1, which
           is also the right rest→hover direction for a dark solid. The hexes
           behind those ratios live in src/theme.css; plan D12 and
           RESEARCH.md's contrast tables carry the working. */
        className="rounded-pill bg-accent-strong px-[26px] py-[13px] text-sm font-bold tracking-[0.02em] text-fg-on-accent transition-[background-color,transform] duration-[200ms] hover:bg-accent-pressed active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 max-[560px]:px-[18px]"
      >
        Ask
      </button>
    </form>
  );
}
