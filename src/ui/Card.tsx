import type { ReactNode } from "react";

/* Result card: hairline box, no fill, no shadow, no lift.
 *
 * The book accent is INK ONLY now. It used to paint a tinted band across the
 * top of every card, which is the single loudest thing a flat UI can do and the
 * first thing to go in the re-skin — three tinted bands in a results grid read
 * as three different components. The accent survives where it still earns its
 * keep: as the colour of the small caps book label, which is the one place the
 * hue is doing real work (telling you which book this came from at a glance).
 *
 * That is also why the .card-head-* component classes are gone from theme.css:
 * they existed to pair a fill with its ink, and there is no fill any more, so
 * plain `text-*` utilities do the whole job. */
export type CardAccent = "terra" | "sage" | "butter";

const HEAD_INK: Record<CardAccent, string> = {
  terra: "text-terra",
  sage: "text-sage",
  butter: "text-butter",
};

export interface CardProps {
  accent: CardAccent;
  /** Header slot: book title left, page label right (pass both as children). */
  header: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ accent, header, className = "", children }: CardProps) {
  return (
    <article
      /* The hover is a border step, not a lift. Nothing in this language
         translates on hover, and `shadow-card-hover` is now identical to
         `shadow-card` precisely so that a call site asking for the old lift
         gets nothing rather than a half-flat one. */
      className={`flex flex-col overflow-hidden rounded-card border border-border bg-surface-raised transition-colors duration-150 hover:border-border-strong ${className}`}
    >
      <div
        className={`flex items-center justify-between gap-3 px-4 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] ${HEAD_INK[accent]}`}
      >
        {header}
      </div>
      <div className="flex flex-1 flex-col px-4 pt-2 pb-4">{children}</div>
    </article>
  );
}
