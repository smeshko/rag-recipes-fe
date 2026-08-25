import { useToggleFavourite } from "../../api";

/* The star, shared by all four surfaces that carry one: the recipe page, a
   search result card, a book-contents row and the favourites list itself.
   One component, so a star cannot mean different things in different places.

   WHO OWNS THE TRUTH: the caller. Every surface already knows the answer from
   the data it renders — `favourited_at` on a detail or a listing row, or the
   ['favourites'] id set on a search card, which is the one shape that cannot
   know (see `useFavouriteIds`). Passing it in keeps this component free of a
   second opinion about server state.

   WHO OWNS THE OPTIMISM: this component, and only while a request is in
   flight. The intended state wins over `favourited` from the click until the
   mutation settles, so the star fills instantly without a synthesized row
   landing in a shared cache (the reasoning is in `useToggleFavourite`). By the
   time it settles, that hook has WRITTEN the server's `favourited_at` into the
   caller's own data, so what the caller passes next render already agrees and
   there is no second flicker. On failure the intention is dropped and the star
   snaps back to what the server still says, under an announced message.

   NOT A <Link>, and never inside one: on a search card this button sits ON the
   card but OUTSIDE its <Link> (a button inside an anchor is invalid HTML, and
   the click would navigate instead of starring). The card positions it; this
   component only paints. */

const STAR_PATH =
  "M12 2.6l2.86 5.8 6.4.93-4.63 4.51 1.09 6.37L12 17.2l-5.72 3.01 1.09-6.37L2.74 9.33l6.4-.93L12 2.6z";

export interface FavouriteButtonProps {
  itemId: string;
  /** The server's answer, from whatever the caller already renders. */
  favourited: boolean;
  /** `sm` on cards and rows, `md` in the recipe page's action row. */
  size?: "sm" | "md";
  /** The recipe's title, so the control's accessible name says what it saves. */
  title?: string;
  className?: string;
}

export function FavouriteButton({
  itemId,
  favourited,
  size = "sm",
  title,
  className = "",
}: FavouriteButtonProps) {
  const toggle = useToggleFavourite(itemId);
  /* `variables` is the value passed to the last mutate() call; while pending
     it IS the intended state. Read only under isPending so a settled mutation
     never keeps overriding the server. */
  const starred = toggle.isPending
    ? (toggle.variables ?? favourited)
    : favourited;

  const box = size === "md" ? "h-10 w-10" : "h-9 w-9";
  const glyph = size === "md" ? 20 : 17;

  return (
    <>
      <button
        type="button"
        data-testid="favourite-toggle"
        aria-pressed={starred}
        /* The accessible name says what the CLICK does, and the recipe's own
           title disambiguates a grid of otherwise identical stars for a screen
           reader moving control to control. */
        aria-label={
          starred
            ? `Remove ${title ?? "this recipe"} from favourites`
            : `Save ${title ?? "this recipe"} to favourites`
        }
        onClick={() => toggle.mutate(!starred)}
        /* A borderless icon button on a hover fill — the shape every icon
           control in this language takes, and the reason the tinted pill went:
           a filled chip around the star made a toggle read as a badge, and on a
           search card it competed with the card's own hairline. What is left
           carries the state entirely in the glyph (below) and in its ink:
           accent when saved, subtle grey when not. */
        className={`inline-flex ${box} items-center justify-center rounded-pill transition-colors hover:bg-surface-hover pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${
          starred ? "text-accent" : "text-fg-subtle"
        } ${className}`}
      >
        {/* One path, filled when starred and stroked when not. This is the
            app's one deliberately-filled icon: outline-vs-filled IS how the
            control says saved, so the two shapes stay even though nothing else
            here is filled — and being the same path either way, the control
            does not jump as it toggles. */}
        <svg
          width={glyph}
          height={glyph}
          viewBox="0 0 24 24"
          fill={starred ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={starred ? 0 : 1.7}
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d={STAR_PATH} />
        </svg>
      </button>
      {toggle.isError && (
        /* The house rule: the backend's own sentence, verbatim, announced.
           `sr-only` would hide a real failure from a sighted reader, so it
           renders — the caller's layout decides WHERE, by where it puts this
           component. It carries its own fill because one of those places is a
           search card, where it lands over the card's own text. */
        <span
          role="alert"
          className="rounded-[10px] bg-danger-fill px-2 py-1 text-[12px] font-semibold text-danger"
        >
          {toggle.error.message}
        </span>
      )}
    </>
  );
}
