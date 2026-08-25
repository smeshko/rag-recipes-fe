import { useRef, useState } from "react";
import { useUploadBooks } from "../../api";
import { UploadOutcome } from "./UploadOutcome";

/* Deliberately NOT a Panel: a dashed edge is the one border in the app that
   says "drop something here", and Panel's hairline would make this read as
   just another box. --color-border-strong exists for exactly this edge, and
   the accent it takes on hover/drag is interactive ink, not decoration.
   No `accept` filter on the input and no client-side type check: the server's
   magic-byte 415 is the authority. */

export function Dropzone() {
  const upload = useUploadBooks();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragDepth, setDragDepth] = useState(0);

  const addFiles = (list: ArrayLike<File> | null | undefined) => {
    const files = Array.from(list ?? []);
    if (files.length === 0 || upload.isPending) {
      return;
    }
    /* mutate resets the previous outcome — results dismiss on the next drop. */
    upload.mutate(files);
  };

  const active = dragDepth > 0;
  /* The phase's only `dark:` utilities, and the reason @custom-variant dark
     exists: every other surface re-themes by VALUE, but these two fills want a
     different TOKEN. `surface-raised` is a translucent card colour lifted over
     a light page; in dark it sits BELOW `surface-inset` on the ramp, so a 55%
     pass of it over `surface` is very nearly the page itself and the zone
     loses its fill entirely. `surface-inset` is the token that lifts in dark.
     Keep the two arms' opacities in step — light and dark differ only in which
     token they tint. */
  const zoneLook = active
    ? "border-accent bg-surface-raised/85 dark:bg-surface-inset/85"
    : "border-border-strong bg-surface-raised/55 hover:border-accent hover:bg-surface-raised/85 dark:bg-surface-inset/55 dark:hover:bg-surface-inset/85";

  return (
    <div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the whole zone is a convenience click target; the button inside is the accessible control */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard access goes through the real <button>, which stops propagation */}
      <div
        data-testid="dropzone"
        aria-busy={upload.isPending}
        /* The one row on the site with no `flex-wrap` and two `flex-none`
           children — a 54px tile and a button — so at 375px it could not
           shrink and simply overflowed. On the phone tier it becomes a
           stack; note `items-start`, so the icon does not stretch. */
        className={`flex cursor-pointer items-center gap-6 rounded-panel border-2 border-dashed p-[34px] transition-colors duration-150 max-[560px]:flex-col max-[560px]:items-start max-[560px]:gap-4 max-[560px]:p-6 ${zoneLook}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragDepth((depth) => depth + 1);
        }}
        onDragLeave={() => setDragDepth((depth) => Math.max(0, depth - 1))}
        onDrop={(event) => {
          event.preventDefault();
          setDragDepth(0);
          addFiles(event.dataTransfer?.files);
        }}
      >
        <div className="grid h-[54px] w-[54px] flex-none place-items-center rounded-2xl bg-accent-fill">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 fill-none stroke-accent stroke-2"
            aria-hidden="true"
          >
            <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
          </svg>
        </div>
        <div>
          <b className="block text-[15px] font-semibold">
            {upload.isPending ? "Adding to the shelf…" : "Drop cookbooks here"}
          </b>
          <small className="mt-[3px] block text-[14px] text-fg-muted">
            PDF only · duplicates are detected automatically · batches go
            through Anthropic overnight pricing
          </small>
        </div>
        <button
          type="button"
          disabled={upload.isPending}
          /* The near-black solid every primary action in the app now wears
             (SearchInput's send button is the same pair). Hover fades instead
             of darkening because the token inverts between themes — one class
             reads correctly in both, where a darker-shade hover would not. */
          /* ml-auto is what pushes it right in the row; in the stacked arm it
             does nothing useful and would fight w-full, so it is dropped
             there. Drag-and-drop is meaningless on a phone — this button is
             the only real affordance, hence full width. */
          className="ml-auto flex-none rounded-pill bg-surface-inverted px-6 py-3 text-[14px] font-medium text-fg-inverted pointer-coarse:min-h-11 transition-opacity duration-150 hover:opacity-80 disabled:opacity-60 max-[560px]:ml-0 max-[560px]:w-full"
          onClick={(event) => {
            /* The zone's own click handler also opens the picker — without
               stopPropagation one click would open it twice. */
            event.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          data-testid="dropzone-input"
          type="file"
          multiple
          hidden
          /* A programmatic input.click() bubbles back to the zone's own
             handler, which would click the input again — cut the loop. */
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            addFiles(event.target.files);
            /* Reset so re-picking the same file fires change again. */
            event.target.value = "";
          }}
        />
      </div>
      <UploadOutcome
        summary={upload.data ?? null}
        error={upload.error ?? null}
      />
    </div>
  );
}
