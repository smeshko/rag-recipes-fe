import type { CSSProperties, ReactNode } from "react";

/* Staggered-reveal wrapper over theme.css's bloom keyframes. Grid items use
   base + index * step; section-level blooms pass an explicit delay because
   their mockup offsets are irregular and no formula reproduces them. */
export interface BloomProps {
  index?: number;
  /** First-item offset in seconds (search .30, fallback .24, library .18). */
  base?: number;
  step?: number;
  /** 0.6s for grid/list items, 0.7s for page chrome. */
  duration?: 0.6 | 0.7;
  /** Explicit offset in seconds — bypasses the base + index * step formula. */
  delay?: number;
  className?: string;
  children: ReactNode;
}

export function Bloom({
  index = 0,
  base = 0.3,
  step = 0.04,
  duration = 0.6,
  delay,
  className = "",
  children,
}: BloomProps) {
  const offset = delay ?? base + index * step;
  const animation = duration === 0.7 ? "bloom" : "bloom-card";
  return (
    <div
      className={`${animation} ${className}`}
      style={{ "--bloom-delay": `${offset}s` } as CSSProperties}
    >
      {children}
    </div>
  );
}
