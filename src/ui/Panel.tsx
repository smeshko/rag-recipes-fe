import type { ReactNode } from "react";

/* The reusable 20px surface (recipe panels, dropzone, fallback notice all
   share it). The 22px two-column answer card is epic 02's own component. */
export interface PanelProps {
  className?: string;
  children: ReactNode;
}

export function Panel({ className = "", children }: PanelProps) {
  return (
    <section
      /* The highest-leverage single line on the recipe surface: Panel backs
         the ingredients, method and edit panels alike, so 28px a side is 56px
         off a 335px box on every one of them. */
      className={`rounded-[20px] border border-border bg-surface-raised px-7 py-[26px] shadow-card max-[560px]:px-5 max-[560px]:py-5 ${className}`}
    >
      {children}
    </section>
  );
}
