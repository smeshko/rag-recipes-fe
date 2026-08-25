import type { ReactElement } from "react";

/* The icon set, in one file so the stroke language stays consistent: 24x24
   viewBox, `fill="none"`, 1.75 stroke, round caps and joins, sized by the
   caller through className. Line icons at a single weight are most of what
   makes a flat UI read as one system — a mix of filled and outlined glyphs at
   different weights is the fastest way to lose it.
   FavouriteButton's star is the deliberate exception: it toggles between
   outline and filled to carry state, so it owns its own SVG.
 *
 * Every icon here is DECORATIVE: `aria-hidden` is baked in rather than left to
 * the caller, because each one sits next to a visible text label or inside a
 * button that carries its own aria-label. None of them may be the only source
 * of an accessible name. If you ever need a labelled icon, give the BUTTON the
 * label — do not add a <title> here, which would be unreachable markup under
 * aria-hidden (the same reasoning SearchInput documents). */

interface IconProps {
  /** Tailwind size/colour classes. Defaults to 18px square, current colour. */
  className?: string;
}

const BASE = "flex-none stroke-current";

function Svg({
  className = "h-[18px] w-[18px]",
  children,
}: IconProps & { children: ReactElement | ReactElement[] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${BASE} ${className}`}
      fill="none"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Pencil-on-page — the "start something new" action, top of the rail. */
export function IconCompose({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      <path d="M18.4 3.6a1.98 1.98 0 0 1 2.8 2.8L12.8 14.8l-3.5.7.7-3.5z" />
    </Svg>
  );
}

/** Magnifier — search, and the Cook destination. */
export function IconSearch({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </Svg>
  );
}

/** Outline star — the Favourites destination. */
export function IconStar({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z" />
    </Svg>
  );
}

/** Stacked books — the Library destination. */
export function IconLibrary({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M10 5a1 1 0 0 1 1-1h3.5A1.5 1.5 0 0 1 16 5.5v13a1.5 1.5 0 0 1-1.5 1.5H11a1 1 0 0 1-1-1z" />
      <path d="M17.1 6.3l1.9-.5a1 1 0 0 1 1.22.71l2.1 7.8" />
    </Svg>
  );
}

/** The sidebar/panel glyph — opens the rail on mobile, the target's own icon. */
export function IconSidebar({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9.5 4v16" />
    </Svg>
  );
}

/** X — dismisses the mobile drawer. */
export function IconClose({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

/** Four-point sparkle — the "ask the model" suggestion chip. */
export function IconSparkle({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9-1.9 4.9-1.9-4.9-4.9-1.9 4.9-1.9z" />
      <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </Svg>
  );
}

/** Bulleted list — the "compose a menu" suggestion chip. */
export function IconMenuList({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
    </Svg>
  );
}

/** Chevron — the disclosure on the composer's menu triggers. */
export function IconChevronDown({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 9.5l6 6 6-6" />
    </Svg>
  );
}

/** Arrow-up in the composer's solid send button. */
export function IconSend({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </Svg>
  );
}
