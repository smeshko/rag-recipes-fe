import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <section data-testid="notfound-page" className="bloom pt-16 text-center">
      <h1 className="font-display text-[clamp(28px,4vw,40px)] font-medium leading-[1.2]">
        Nothing simmering <em className="text-accent italic">here</em>.
      </h1>
      <p className="mt-2.5 text-[15px] text-fg-muted">
        That page isn't on the shelf.
      </p>
      <p className="mt-5">
        {/* accent-strong / accent-pressed, theme-agnostic — see SearchInput's
            Ask button for the measured pairs (plan D12). */}
        <Link
          to="/"
          className="rounded-pill bg-accent-strong px-[26px] py-[13px] text-sm font-bold text-fg-on-accent transition-colors hover:bg-accent-pressed"
        >
          Back to the kitchen
        </Link>
      </p>
    </section>
  );
}
