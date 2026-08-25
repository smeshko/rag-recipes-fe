import { IconMenuList, IconSparkle } from "../../ui";

/* The two LLM actions the shelf offers, as a row of suggestion chips under the
   composer — the shape the target uses for "Create an image / Write or edit /
   Look something up".
 *
 * It used to be a bordered card with an eyebrow, a sentence of explanatory
 * copy and two solid buttons: a whole panel to hold two actions. Chips say the
 * same thing in one line, sit visually closer to the field they act on, and
 * stop competing with the answer that lands underneath them.
 *
 * Enter and the bar's own button only ever run the plain search; anything that
 * spends an LLM round-trip starts here, so the reader can see the cost-bearing
 * controls as a group and the bar stays a search bar.
 *
 * Always rendered — a reader who has just typed can ask straight away, and a
 * reader with an answer up can still compose a menu from the same question.
 * Both buttons ask the DRAFT, so an emptied box disables them rather than
 * letting a click silently no-op; an in-flight action disables its own button
 * so a second click cannot buy a second round-trip. */

/* Ghost chip, sized like the target's suggestion row. The disabled arm keeps
   the border so the row does not reflow when a draft is emptied. */
const CHIP =
  "inline-flex items-center gap-2 rounded-pill border border-border px-3.5 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-fg-muted pointer-coarse:min-h-11";

export function AiAnswers({
  onAsk,
  onMenu,
  disabled = false,
  asking = false,
  composing = false,
}: {
  onAsk: () => void;
  onMenu: () => void;
  /** The draft is empty — nothing to ask about. */
  disabled?: boolean;
  asking?: boolean;
  composing?: boolean;
}) {
  return (
    <section
      data-testid="ai-answers"
      /* Named by a visually-hidden heading rather than an aria-label, so the
         landmark's name is a real node in the document. A <section> with no
         accessible name is not a landmark at all. */
      aria-labelledby="ai-answers-heading"
      className="mx-auto mt-3 flex max-w-[720px] flex-wrap justify-center gap-2"
    >
      <h2 id="ai-answers-heading" className="sr-only">
        AI answers
      </h2>
      <button
        type="button"
        onClick={onAsk}
        disabled={disabled || asking}
        aria-busy={asking ? true : undefined}
        className={CHIP}
      >
        <IconSparkle className="h-4 w-4" />
        Ask the shelf
      </button>
      <button
        type="button"
        onClick={onMenu}
        disabled={disabled || composing}
        aria-busy={composing ? true : undefined}
        className={CHIP}
      >
        <IconMenuList className="h-4 w-4" />
        Compose a menu
      </button>
    </section>
  );
}
