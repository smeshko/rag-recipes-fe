import { useId, useLayoutEffect, useRef } from "react";
import { fieldClass, labelClass } from "./fieldChrome";
import type { EditForm, ScalarField } from "./useEditForm";

export interface TitleFieldsProps {
  form: EditForm;
  /** The one client-side rule (D10): a title cannot be cleared. */
  isValid: boolean;
  setField: (key: ScalarField, value: string) => void;
}

/**
 * The recipe's own two lines — title and summary — as editable faces of the
 * read page's `TitleBlock`. The title field keeps the page-title size (26px
 * semibold, tight tracking) so what you type looks like the heading it will
 * become; the summary drops to plain muted body text, because the retired
 * italic serif was the one flourish on this surface and nothing here is
 * decorative any more.
 *
 * `TitleBlock` itself is untouched: this is a parallel component in `edit/`,
 * not a mode flag threaded through a read-mode file.
 */
export function TitleFields({ form, isValid, setField }: TitleFieldsProps) {
  const titleId = useId();
  const summaryId = useId();
  const hintId = useId();
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  /* Auto-grow: reset to `auto` first, or scrollHeight only ever reports the
     height the box already has and the field can never shrink again. A layout
     effect, not an effect, so the reflow lands before paint. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: form.summary is the trigger, not an input — the effect measures the DOM after React has written the new value into it, so re-measuring on every change is the whole point.
  useLayoutEffect(() => {
    const el = summaryRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    /* jsdom (and any display:none ancestor) reports 0 — pinning the field to
       0px there would hide it, so the measurement only counts when real. */
    if (el.scrollHeight > 0) {
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [form.summary]);

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div>
        <label className={`${labelClass} block`} htmlFor={titleId}>
          Title
        </label>
        <input
          id={titleId}
          value={form.title}
          onChange={(event) => setField("title", event.target.value)}
          aria-invalid={isValid ? undefined : true}
          aria-describedby={isValid ? undefined : hintId}
          className={`${fieldClass} mt-1.5 text-[26px] font-semibold tracking-[-0.02em] leading-[1.2] text-fg`}
        />
        {isValid ? null : (
          /* Rendered, not merely announced: the Save button this rule also
             drives arrives with the action row in TASK-006, so until then the
             hint is the whole visible consequence of an empty title. */
          <p id={hintId} className="mt-1.5 text-[13px] text-danger">
            A recipe needs a title.
          </p>
        )}
      </div>
      <div>
        <label className={`${labelClass} block`} htmlFor={summaryId}>
          Summary
        </label>
        <textarea
          id={summaryId}
          ref={summaryRef}
          rows={2}
          value={form.summary}
          onChange={(event) => setField("summary", event.target.value)}
          className={`${fieldClass} mt-1.5 resize-none text-fg-muted`}
        />
      </div>
    </div>
  );
}
