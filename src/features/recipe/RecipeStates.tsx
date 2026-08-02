import { Link } from "react-router";
import type { ApiError } from "../../api";

/** Calm surface-and-fg: an expected dead end, not an error. */
export function RecipeNotFound({ id }: { id: string | undefined }) {
  return (
    <div className="pt-16 text-center">
      <h1 className="font-display text-[clamp(28px,4vw,40px)] font-medium leading-[1.2]">
        That page isn't on the shelf.
      </h1>
      <p className="mt-2.5 text-[15px] text-fg-muted">
        No recipe answers to <em className="italic">{id}</em>.
      </p>
      <p className="mt-5">
        <Link
          to="/"
          className="text-[14px] font-semibold text-accent transition-colors hover:text-accent-strong"
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
    <div className="mx-auto mt-16 max-w-[560px] rounded-[20px] border border-danger-border bg-danger-fill px-7 py-6 text-center">
      <p className="text-[15px] font-semibold text-danger">{error.message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-pill bg-danger px-5 py-2 text-[13px] font-bold text-fg-on-accent transition-opacity hover:opacity-90"
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
      <h1 className="font-display text-[clamp(28px,4vw,40px)] font-medium leading-[1.2]">
        <em className="text-accent italic">{title}</em> isn't a recipe.
      </h1>
      <p className="mt-2.5 text-[15px] text-fg-muted">
        This shelf entry is a different kind of knowledge — the recipe view
        can't do it justice.
      </p>
      <p className="mt-5">
        <Link
          to="/"
          className="text-[14px] font-semibold text-accent transition-colors hover:text-accent-strong"
        >
          ← Back to Cook
        </Link>
      </p>
    </div>
  );
}
