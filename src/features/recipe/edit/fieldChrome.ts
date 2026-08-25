/* The one place the edit form's field chrome is written down, so the six
   scalar editors cannot drift apart a class at a time. It stays in `edit/`
   rather than `src/ui/`: one consumer, no primitive yet.

   Every class here is a role token (D19). The fills moved from `surface-inset`
   to `surface-raised` in the re-skin: a field is now drawn by its hairline
   border, not by a tinted well, and an inset fill on a white page reads as a
   disabled control rather than as a place to type. */

/** Field labels. Sentence case at 13px, not the retired uppercase micro-caps:
    small-caps tracking is the one ornament this language spends on section
    labels (`Eyebrow`), and spending it again on every input turns a form into
    a wall of shouting. Always on a real `<label htmlFor>` — the visible label
    and the accessible name are the same string, which is what makes the form
    screen-reader navigable. */
export const labelClass = "text-[13px] font-medium text-fg-muted";

/** Title and summary: hairline box, raised fill, and a focus that moves the
    border rather than lighting it up — `fg-subtle` plus the 2px halo, the same
    focus the composer uses. Carries no text colour: each field sets its own
    face, and two colour utilities on one element would be decided by
    stylesheet order rather than by the call site. */
/* `pointer-coarse:text-base` on every editable field here and in
   LineListEditor: iOS Safari zooms the viewport when a focused control's
   font-size is under 16px, and the edit form is the only screen in the app
   built out of text inputs.

   Keyed to the POINTER, not to `max-[560px]`. An earlier pass keyed it to
   width and the 667x375 landscape sweep caught it immediately: a landscape
   phone is 667px wide, misses every phone tier, and is still iOS Safari —
   so it still zoomed. Same lesson as the tap targets (DECISIONS.md D3):
   layout is a width concern, touch behaviour is not. */
export const fieldClass =
  "w-full rounded-reco border border-border bg-surface-raised px-3 py-2 text-[15px] outline-none transition-[border-color,box-shadow] focus:border-fg-subtle focus:shadow-focus placeholder:text-fg-subtle pointer-coarse:text-base pointer-coarse:min-h-11";

/** The four facts sit in a chip rather than a bare field, because the label and
    its value belong to one control. Same hairline box and same focus as
    `fieldClass`, minus the shadow the retired chip carried — the shell owns the
    border, so the ring is `focus-within:`. */
export const factChipClass =
  "rounded-reco border border-border bg-surface-raised px-4 py-2.5 transition-[border-color,box-shadow] focus-within:border-fg-subtle focus-within:shadow-focus";

/** …and the input inside it is bare: the chip is the visible field. */
export const factInputClass =
  "w-full border-none bg-transparent text-[15px] text-fg outline-none pointer-coarse:min-h-11 placeholder:text-fg-subtle pointer-coarse:text-base";
