import type { ReactNode } from "react";

/* Two shapes, six tones — the mockups' metadata pill (sm, bordered) and
   status pill (md, borderless) on one component. `.pill.review` in the
   library mockup resolves to the same colours as warn: one tone, two names. */
export type PillSize = "sm" | "md";
export type PillTone =
  | "neutral"
  | "warn"
  | "ok"
  | "working"
  | "failed"
  | "accent";

const SIZE: Record<PillSize, string> = {
  sm: "text-[11.5px] px-[11px] py-[4px] border",
  md: "text-[12px] px-[14px] py-[6px]",
};

const TONE: Record<PillTone, string> = {
  neutral: "text-ink-soft bg-cream border-line",
  warn: "text-danger bg-danger-soft border-danger-line",
  ok: "text-ok bg-ok-soft border-ok-soft",
  working: "text-apricot bg-apricot-soft border-apricot-soft",
  failed: "text-white bg-danger border-danger",
  accent: "text-sage bg-sage-soft border-sage-soft",
};

export interface PillProps {
  size?: PillSize;
  tone?: PillTone;
  /** The bookpill modifier: uppercase + .08em tracking (a usage, not a tone). */
  uppercase?: boolean;
  className?: string;
  children: ReactNode;
}

export function Pill({
  size = "sm",
  tone = "neutral",
  uppercase = false,
  className = "",
  children,
}: PillProps) {
  const caps = uppercase ? "uppercase tracking-[0.08em]" : "";
  return (
    <span
      className={`inline-flex items-center rounded-pill font-bold ${SIZE[size]} ${TONE[tone]} ${caps} ${className}`}
    >
      {children}
    </span>
  );
}
