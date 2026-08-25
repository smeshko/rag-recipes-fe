import type { ReactNode } from "react";

/* A small section label.
 *
 * Twice reduced. It began as a filled accent pill with a leading dot; the
 * first re-skin pass dropped the fill and the dot but kept 11px uppercase
 * micro-caps with wide tracking. Reading chatgpt.com's own computed styles
 * showed that was still the retired language talking: their section labels
 * ("Pinned", "Projects", "Chats") are 14px, weight 500, tertiary grey, and
 * `text-transform: none` — there is no small-caps anywhere in the target.
 *
 * So: sentence case, one step down from body, muted. The one deliberate
 * exception left in the app is MenuCard's course slot, which is a fixed
 * taxonomy rather than prose and stays small-caps on purpose. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center text-[13px] font-medium text-fg-muted">
      {children}
    </span>
  );
}
