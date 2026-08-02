import type { ReactNode } from "react";

/* md-Pill geometry plus a leading dot and .1em tracking. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-pill bg-accent-fill px-[14px] py-[6px] text-[12px] font-bold uppercase tracking-[0.1em] text-accent">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}
