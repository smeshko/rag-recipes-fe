import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useUploadBooks } from "../../api";
import { UploadOutcome } from "./UploadOutcome";

/* Mockup-faithful surface (sk-library.html:71-102): dashed #DCCFB4 border,
   translucent white bg, apricot hover — deliberately NOT a Panel. The busy
   state and the outcome area below are declared design extensions; the
   mockup has neither. No `accept` filter on the input and no client-side
   type check: the server's magic-byte 415 is the authority. */

export function Dropzone() {
  const upload = useUploadBooks();
  const location = useLocation();
  const zoneRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dragDepth, setDragDepth] = useState(0);

  /* The nav's "Add books" lands on /library#add. Keyed on location.key, not
     hash: useLocation never observes native hashchange, so a repeat click
     from /library#add would otherwise not re-fire (1.3's finding). */
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-fire on every navigation (location.key); reading hash alone would miss repeat clicks
  useEffect(() => {
    if (location.hash === "#add") {
      zoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      buttonRef.current?.focus();
    }
  }, [location.key]);

  const addFiles = (list: ArrayLike<File> | null | undefined) => {
    const files = Array.from(list ?? []);
    if (files.length === 0 || upload.isPending) {
      return;
    }
    /* mutate resets the previous outcome — results dismiss on the next drop. */
    upload.mutate(files);
  };

  const active = dragDepth > 0;
  const zoneLook = active
    ? "border-apricot bg-white/85"
    : "border-[#DCCFB4] bg-white/55 hover:border-apricot hover:bg-white/85";

  return (
    <div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the whole zone is a convenience click target; the button inside is the accessible control */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard access goes through the real <button>, which stops propagation */}
      <div
        ref={zoneRef}
        data-testid="dropzone"
        aria-busy={upload.isPending}
        className={`flex cursor-pointer items-center gap-6 rounded-[20px] border-2 border-dashed p-[34px] transition-colors duration-200 ${zoneLook}`}
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
        <div className="grid h-[54px] w-[54px] flex-none place-items-center rounded-2xl bg-apricot-soft">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 fill-none stroke-apricot stroke-2"
            aria-hidden="true"
          >
            <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
          </svg>
        </div>
        <div>
          <b className="block font-display text-[18px] font-semibold">
            {upload.isPending ? "Adding to the shelf…" : "Drop cookbooks here"}
          </b>
          <small className="mt-[3px] block text-[13.5px] text-ink-soft">
            PDF only · duplicates are detected automatically · batches go
            through Anthropic overnight pricing
          </small>
        </div>
        <button
          ref={buttonRef}
          type="button"
          disabled={upload.isPending}
          className="ml-auto flex-none rounded-pill bg-apricot px-6 py-3 text-sm font-bold text-white transition-colors duration-200 hover:bg-apricot-deep disabled:opacity-60"
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
