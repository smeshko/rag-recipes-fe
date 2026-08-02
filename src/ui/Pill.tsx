import type { ReactNode } from "react";

/* Two shapes, six tones — the mockups' metadata pill (sm, bordered) and
   status pill (md, borderless) on one component. `.pill.review` in the
   library mockup resolves to the same colours as warn: one tone, two names.
   `book` is the bookline pill: it paints the categorical sage book accent,
   not --color-accent, which is why it is not called `accent`. */
export type PillSize = "sm" | "md";
export type PillTone =
  | "neutral"
  | "warn"
  | "ok"
  | "working"
  | "failed"
  | "book";

const SIZE: Record<PillSize, string> = {
  sm: "text-[11.5px] px-[11px] py-[4px] border",
  md: "text-[12px] px-[14px] py-[6px]",
};

const TONE: Record<PillTone, string> = {
  neutral: "text-fg-muted bg-surface-inset border-border",
  warn: "text-danger bg-danger-fill border-danger-border",
  ok: "text-success bg-success-fill border-success-fill",
  working: "text-accent bg-accent-fill border-accent-fill",
  failed: "text-fg-on-accent bg-danger border-danger",
  book: "text-sage bg-sage-fill border-sage-fill",
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
      /* min-w-0 + max-w-full: inline-flex does not shrink below its content,
         so a Pill carrying a server-authored string — a book title on the
         recipe head, a citation label — pushed the page sideways at 375px no
         matter what the body's overflow-wrap said. These let it shrink; the
         call site decides whether the text truncates or wraps. */
      className={`inline-flex min-w-0 max-w-full items-center rounded-pill font-bold ${SIZE[size]} ${TONE[tone]} ${caps} ${className}`}
    >
      {children}
    </span>
  );
}
