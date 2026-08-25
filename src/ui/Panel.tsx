import type { ReactNode } from "react";

/* The reusable content surface (recipe panels, dropzone, fallback notice and
   the various empty states all share it).
 *
 * Hairline only — the resting shadow is gone. Note what that means in light,
 * because it is deliberate and looks like a bug if you are not expecting it:
 * --color-surface-raised and --color-surface are BOTH #ffffff there, so a
 * Panel on the page is defined purely by its 1px border and its padding. Dark
 * does lift it (#2f2f2f on #212121). That asymmetry is the target's, not an
 * oversight: on white, boxes are drawn with lines; on near-black, with tone. */
export interface PanelProps {
  className?: string;
  children: ReactNode;
}

export function Panel({ className = "", children }: PanelProps) {
  return (
    <section
      /* Padding is the highest-leverage line on the recipe surface: Panel
         backs the ingredients, method and edit panels alike, so every px a
         side is spent three times over on a 335px phone box. */
      className={`rounded-panel border border-border bg-surface-raised px-6 py-5 max-[560px]:px-4 max-[560px]:py-4 ${className}`}
    >
      {children}
    </section>
  );
}
