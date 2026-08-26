import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <section data-testid="notfound-page" className="pt-16 text-center">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
        Nothing simmering here.
      </h1>
      <p className="mt-2.5 text-[15px] text-fg-muted">
        That page isn't on the shelf.
      </p>
      <p className="mt-5">
        {/* The black solid — the one primary fill in this language, and the
            same one SearchInput's send button spends. Hover FADES rather than
            darkening: --color-surface-inverted is near-white in dark mode, so
            a darker hover token would need a `dark:` arm and opacity does not. */}
        <Link
          to="/"
          className="rounded-pill bg-surface-inverted px-5 py-2.5 pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 text-[14px] font-medium text-fg-inverted transition-opacity hover:opacity-80"
        >
          Back to the kitchen
        </Link>
      </p>
    </section>
  );
}
