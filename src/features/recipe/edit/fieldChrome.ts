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
/* `pointer-coarse:text-base` on every editable field here and in
   LineListEditor: iOS Safari zooms the viewport when a focused control's
   font-size is under 16px, and the edit form is the only screen in the app
   built out of text inputs.

   Keyed to the POINTER, not to `max-[560px]`. An earlier pass keyed it to
   width and the 667x375 landscape sweep caught it immediately: a landscape
   phone is 667px wide, misses every phone tier, and is still iOS Safari —
   so it still zoomed. Same lesson as the tap targets (DECISIONS.md D3):
   layout is a width concern, touch behaviour is not.

   The mouse faces (inherited 15px here, 13px on the fact chips) are
   untouched, so the read and edit surfaces still match at the width the
   mockups describe. */
export const fieldClass =
  "w-full rounded-[12px] border border-border bg-surface-inset px-3 py-2 pointer-coarse:text-base pointer-coarse:min-h-11 focus:border-accent focus:outline-none focus:shadow-focus";

/** The four facts sit in `FactsRow`'s chip instead of the inset field: a
    raised, shadowed shell holding the label and the input together, so the
    row still reads as the read page's facts. The shell owns the border, so
    the focus ring is `focus-within:`. */
export const factChipClass =
  "rounded-[12px] border border-border bg-surface-raised px-4 py-2.5 shadow-card focus-within:border-accent focus-within:shadow-focus";

/** …and the input inside it is bare: the chip is the visible field. */
export const factInputClass =
  "w-full border-none bg-transparent text-[13px] font-semibold text-fg outline-none pointer-coarse:min-h-11 placeholder:font-normal placeholder:text-fg-subtle pointer-coarse:text-base";
