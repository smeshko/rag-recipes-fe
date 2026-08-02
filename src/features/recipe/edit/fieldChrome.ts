/* The one place the edit form's field chrome is written down, so the six
   scalar editors cannot drift apart a class at a time. It stays in `edit/`
   rather than `src/ui/`: one consumer, no primitive yet.

   Every class here is a 5.5 role token (D19) — `surface-inset` specifically
   for field fills, which is the role the token split created for an inset
   sitting on a raised surface. */

/** Field labels: the uppercase micro-caps `FactsRow` prints on its chips, so
    the edit surface reads as the read surface. Always on a real
    `<label htmlFor>` — the visible label and the accessible name are the same
    string, which is what makes the form screen-reader navigable. */
export const labelClass =
  "text-[11px] font-bold tracking-[0.06em] text-fg-subtle uppercase";

/** Title and summary: an inset fill, apricot on focus. Carries no text colour
    — each field sets its own face, and two colour utilities on one element
    would be decided by stylesheet order rather than by the call site. */
export const fieldClass =
  "w-full rounded-[12px] border border-border bg-surface-inset px-3 py-2 focus:border-accent focus:outline-none focus:shadow-focus";

/** The four facts sit in `FactsRow`'s chip instead of the inset field: a
    raised, shadowed shell holding the label and the input together, so the
    row still reads as the read page's facts. The shell owns the border, so
    the focus ring is `focus-within:`. */
export const factChipClass =
  "rounded-[12px] border border-border bg-surface-raised px-4 py-2.5 shadow-card focus-within:border-accent focus-within:shadow-focus";

/** …and the input inside it is bare: the chip is the visible field. */
export const factInputClass =
  "w-full border-none bg-transparent text-[13px] font-semibold text-fg outline-none placeholder:font-normal placeholder:text-fg-subtle";
