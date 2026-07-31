import { useState } from "react";

/* Presentational pill field. The Ask button is earmarked for the on-demand
   answer flow (POST /answers) — epic 02 wires it; this phase only reports
   the submitted text. Focus replaces the resting shadow with the deepened
   ring shadow (mockup :82) rather than stacking on top of it. */
export interface SearchInputProps {
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (query: string) => void;
}

export function SearchInput({
  placeholder = "What are we cooking?",
  defaultValue = "",
  onSubmit,
}: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);

  /* Reseed when the caller's defaultValue moves (the URL query changing under
     us on Back/Forward). React's documented "adjust state during render"
     pattern rather than a key-based remount: remounting would drop keyboard
     focus on every submit. The prop contract is unchanged — epic 02 phase 2.1
     still owns making this controlled. */
  const [seed, setSeed] = useState(defaultValue);
  if (seed !== defaultValue) {
    setSeed(defaultValue);
    setValue(defaultValue);
  }

  return (
    <form
      className="flex items-center gap-3.5 rounded-pill border border-line bg-card py-2 pr-2 pl-[26px] shadow-card transition-shadow duration-[250ms] focus-within:shadow-[0_14px_40px_rgba(94,74,44,0.14),0_0_0_4px_var(--color-apricot-soft)]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
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
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="flex-1 border-none bg-transparent font-display text-[19px] text-ink outline-none"
      />
      <button
        type="submit"
        className="rounded-pill bg-apricot px-[26px] py-[13px] text-sm font-bold tracking-[0.02em] text-white transition-[background-color,transform] duration-[200ms] hover:bg-apricot-deep active:scale-[0.97]"
      >
        Ask
      </button>
    </form>
  );
}
