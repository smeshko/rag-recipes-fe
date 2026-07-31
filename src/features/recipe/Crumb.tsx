import { Link, useLocation } from "react-router";
import type { SearchMode } from "../../api/search";

/* {q, mode} is the cross-plan link-state contract (2.1 ResultCard, 2.3
   chips/picks all produce it). mode is reproduced only when not hybrid —
   2.1 keeps the default out of the URL. */
export function Crumb() {
  const { state } = useLocation() as {
    state: { q?: string; mode?: SearchMode } | null;
  };
  const q = state?.q;

  if (!q) {
    return (
      <Link
        to="/"
        className="text-[13px] font-semibold text-ink-soft transition-colors hover:text-apricot"
      >
        ← Back to Cook
      </Link>
    );
  }

  const params = new URLSearchParams({ q });
  if (state?.mode && state.mode !== "hybrid") {
    params.set("mode", state.mode);
  }

  return (
    <Link
      to={`/?${params.toString()}`}
      className="text-[13px] font-semibold text-ink-soft transition-colors hover:text-apricot"
    >
      ← Back to results · <em className="italic">“{q}”</em>
    </Link>
  );
}
