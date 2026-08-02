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
      className={`rounded-[20px] border border-border bg-surface-raised px-7 py-[26px] shadow-card ${className}`}
    >
      {children}
    </section>
  );
}
