import type { ReactNode } from "react";

/* A small-caps section label — nothing more.
 *
 * It used to be a filled accent pill with a leading dot. Both are gone: a
 * decorative dot is pure ornament, and a tinted pill made a label look like an
 * interactive chip sitting next to real ones (MenuCard and AnswerCard both put
 * this directly above citation chips, which ARE tinted). Small, spaced,
 * subtle-grey caps says "this is a label" without borrowing a control's
 * clothes. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
      {children}
    </span>
  );
}
