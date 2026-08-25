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
    /* Ghost chips, one solid selection. The unselected hover is a fill, not a
       border-and-ink colour change — recolouring the outline on hover made
       three chips flicker between two hues as the pointer crossed the row. */
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {CHIPS.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={mode === active}
          onClick={() => onSelect(mode)}
          className={
            mode === active
              ? "inline-flex items-center rounded-pill border border-transparent bg-surface-inverted px-3 py-1.5 text-[13px] font-medium text-fg-inverted pointer-coarse:min-h-11"
              : "inline-flex items-center rounded-pill border border-border px-3 py-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg pointer-coarse:min-h-11"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
