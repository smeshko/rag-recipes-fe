import { Link } from "react-router";
import type { ApiError } from "../../api";

/** Calm surface-and-fg: an expected dead end, not an error. */
export function RecipeNotFound({ id }: { id: string | undefined }) {
  return (
    <div className="pt-16 text-center">
      {/* The same 26px/semibold as a real recipe title: an empty state is a
          page, not a poster, and a fluid display size made the dead end shout
          louder than the recipes it stands in for. */}
      <h1 className="text-[26px] font-semibold leading-[1.3] tracking-[-0.02em]">
        That page isn't on the shelf.
      </h1>
      <p className="mt-2.5 text-[15px] text-fg-muted">
        No recipe answers to <em className="italic">{id}</em>.
      </p>
      <p className="mt-5">
        <Link
          to="/"
          className="text-[14px] font-semibold text-accent transition-colors hover:text-accent-strong inline-flex items-center pointer-coarse:min-h-11"
        >
          ← Back to Cook
        </Link>
      </p>
    </div>
  );
}

/** Danger-toned: something actually broke. */
export function RecipeError({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto mt-16 max-w-[560px] rounded-panel border border-danger-border bg-danger-fill px-7 py-6 text-center">
      <p className="text-[15px] font-medium text-danger">{error.message}</p>
      <button
        type="button"
        onClick={onRetry}
        /* Solid danger — the one place a fill still carries meaning rather
           than decoration. Opacity is the hover, as on every solid button
           here: it is the only one that reads correctly in both palettes. */
        className="mt-4 rounded-pill bg-danger px-5 py-2 text-[13px] font-medium pointer-coarse:min-h-11 text-fg-on-accent transition-opacity hover:opacity-80"
      >
        Try again
      </button>
    </div>
  );
}

/** Honest wrong-shape state — the endpoint serves any knowledge item. */
export function RecipeNotARecipe({ title }: { title: string }) {
  return (
    <div className="pt-16 text-center">
      {/* The title used to be set in accent italics inside the sentence. It
          is the item's own name, not an aside, and emphasis in this language
          comes from weight and whitespace — the whole heading already has
          both. */}
      <h1 className="text-[26px] font-semibold leading-[1.3] tracking-[-0.02em]">
        {title} isn't a recipe.
      </h1>
      <p className="mt-2.5 text-[15px] text-fg-muted">
        This shelf entry is a different kind of knowledge — the recipe view
        can't do it justice.
      </p>
      <p className="mt-5">
        <Link
          to="/"
          className="text-[14px] font-semibold text-accent transition-colors hover:text-accent-strong inline-flex items-center pointer-coarse:min-h-11"
        >
          ← Back to Cook
        </Link>
      </p>
    </div>
  );
}

/**
 * The calm state report for an `indexing` recipe — the status a shelved edit
 * or a handwritten recipe returns with. Not an error and not a review flag:
 * the row is saved, the worker just has not chunked and embedded it yet. The
 * honest duration is "until the worker gets to it": a single arq slot runs
 * this queue AND cookbook ingestion, so during an ingestion that is the whole
 * run. Renders nothing for every other status.
 */
export function IndexingNotice({ status }: { status: string }) {
  if (status !== "indexing") {
    return null;
  }
  return (
    <p
      role="status"
      data-testid="recipe-indexing-notice"
      className="mt-5 rounded-reco border border-border bg-surface-inset px-5 py-3 text-[13px] text-fg-muted"
    >
      Saved, and being re-indexed. This recipe is out of search until that
      finishes — usually a moment, but the whole run if a cookbook is being
      ingested right now. Nothing to do; it comes back on its own.
    </p>
  );
}
