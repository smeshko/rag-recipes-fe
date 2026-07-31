import type { ReactNode } from "react";

/* Result card: flat soft-tint header (never a gradient) + hover lift with
   its own deepened shadow (deliberately not the resting --shadow-card). */
export type CardAccent = "terra" | "sage" | "butter";

const HEAD: Record<CardAccent, string> = {
  terra: "card-head-terra",
  sage: "card-head-sage",
  butter: "card-head-butter",
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
      className={`overflow-hidden rounded-card border border-line bg-card transition-[transform,box-shadow] duration-[220ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] hover:-translate-y-[5px] hover:shadow-card-hover ${className}`}
    >
      <div
        className={`flex items-center justify-between px-5 py-3 text-[11.5px] font-bold uppercase tracking-[0.08em] ${HEAD[accent]}`}
      >
        {header}
      </div>
      <div className="flex flex-1 flex-col px-5 pt-[18px] pb-5">{children}</div>
    </article>
  );
}
