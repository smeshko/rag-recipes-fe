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
              ? "rounded-pill border border-surface-inverted bg-surface-inverted px-[15px] py-[7px] text-[13px] font-medium text-fg-inverted"
              : "rounded-pill border border-border bg-surface-raised px-[15px] py-[7px] text-[13px] font-medium text-fg-muted transition-colors hover:border-accent hover:text-accent"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
