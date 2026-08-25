import { Bloom } from "../../ui";

/* The AI answers strip: the two LLM actions the shelf offers, side by side
   under the search bar. Enter and the bar's own button only ever run the
   plain search; anything that spends an LLM round-trip starts here, so the
   reader can see the cost-bearing controls as a group and the bar stays a
   search bar.

   Always rendered — a reader who has just typed can ask straight away, and a
   reader with an answer up can still compose a menu from the same question.
   Both buttons ask the DRAFT, so an emptied box disables them rather than
   letting a click silently no-op; an in-flight action disables its own
   button so a second click cannot buy a second round-trip. */
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
    <Bloom duration={0.7} delay={0.16} className="mx-auto mt-5 max-w-[720px]">
      <section
        data-testid="ai-answers"
        aria-label="AI answers"
        className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-[16px] border border-border bg-surface-raised px-5 py-3.5 shadow-card max-[560px]:px-4"
      >
        <div className="min-w-[200px] flex-1">
          <p className="text-[12px] font-bold tracking-[0.1em] text-fg-subtle uppercase">
            AI answers
          </p>
          <p className="mt-0.5 text-[13.5px] text-fg-muted">
            A direct answer or a whole menu, cited from your shelf.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAsk}
            disabled={disabled || asking}
            aria-busy={asking ? true : undefined}
            className="rounded-pill bg-accent-strong px-4 py-1.5 text-[13px] font-bold text-fg-on-accent pointer-coarse:min-h-11 transition-[background-color,transform] hover:bg-accent-pressed active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ask the shelf
          </button>
          <button
            type="button"
            onClick={onMenu}
            disabled={disabled || composing}
            aria-busy={composing ? true : undefined}
            className="rounded-pill border-[1.5px] border-accent px-4 py-1.5 text-[13px] font-bold text-accent-strong pointer-coarse:min-h-11 transition-colors hover:bg-accent-fill disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            Compose a menu
          </button>
        </div>
      </section>
    </Bloom>
  );
}
