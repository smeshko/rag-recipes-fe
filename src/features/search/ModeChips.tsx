import type { SearchMode } from "../../api/search";

const CHIPS: { mode: SearchMode; label: string }[] = [
  { mode: "hybrid", label: "Hybrid" },
  { mode: "keyword", label: "Keyword only" },
  { mode: "vector", label: "Vector only" },
];

export interface ModeChipsProps {
  active: SearchMode;
  onSelect: (mode: SearchMode) => void;
}

export function ModeChips({ active, onSelect }: ModeChipsProps) {
  return (
    <div className="mt-[18px] flex flex-wrap justify-center gap-2.5">
      {CHIPS.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={mode === active}
          onClick={() => onSelect(mode)}
          className={
            mode === active
              ? "rounded-pill border border-ink bg-ink px-[15px] py-[7px] text-[13px] font-medium text-cream"
              : "rounded-pill border border-line bg-card px-[15px] py-[7px] text-[13px] font-medium text-ink-soft transition-colors hover:border-apricot hover:text-apricot"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
