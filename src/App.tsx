import { useQuery } from "@tanstack/react-query";
import { ApiError, type HealthResponse, request } from "./api";

/* Temporary demo proving the typed client + proxy + provider end to end.
   Moves into the search-page placeholder in phase 1.3. */
function HealthProbe() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => request<HealthResponse>("/health"),
  });

  if (health.isPending) {
    return <span className="text-ink-faint">checking the stove…</span>;
  }
  if (health.isError) {
    const err = health.error;
    const label =
      err instanceof ApiError ? `${err.code}: ${err.message}` : "unreachable";
    return <span className="text-danger">backend {label}</span>;
  }
  return <span className="text-sage">backend {health.data.status}</span>;
}

function App() {
  return (
    <div className="mx-auto max-w-[1120px] px-9 pb-[100px]">
      <header className="bloom flex items-center justify-between py-[26px]">
        <div className="font-display text-[23px] font-semibold">
          Stove<span className="text-apricot">.</span>
        </div>
        <nav className="flex gap-1.5">
          <span className="rounded-pill bg-ink px-[18px] py-[9px] text-sm font-semibold text-cream">
            Cook
          </span>
          <span className="rounded-pill px-[18px] py-[9px] text-sm font-semibold text-ink-soft">
            Library
          </span>
        </nav>
      </header>

      <section
        className="bloom pt-10 text-center"
        style={{ "--bloom-delay": "0.06s" } as React.CSSProperties}
      >
        <h1 className="font-display text-[clamp(32px,4.4vw,46px)] font-medium leading-[1.2] tracking-[-0.01em]">
          Good morning.{" "}
          <em className="text-apricot italic">What are we cooking?</em>
        </h1>
        <p className="mt-2.5 text-[15px] text-ink-soft">
          Theme placeholder — tokens, fonts and primitives under proof ·{" "}
          <HealthProbe />
        </p>
      </section>

      <section
        className="bloom mt-9 flex items-center justify-center gap-2.5"
        style={{ "--bloom-delay": "0.12s" } as React.CSSProperties}
      >
        <span className="rounded-pill border border-line bg-cream px-[11px] py-1 text-[11.5px] font-bold text-ink-soft">
          12 pancakes
        </span>
        <span className="rounded-pill border border-danger-line bg-danger-soft px-[11px] py-1 text-[11.5px] font-bold text-danger">
          needs review
        </span>
      </section>

      <section className="mt-9 flex justify-center">
        <article
          className="bloom-card w-full max-w-[352px] overflow-hidden rounded-card border border-line bg-card shadow-card"
          style={{ "--bloom-delay": "0.3s" } as React.CSSProperties}
        >
          <div className="card-head-sage flex items-center justify-between px-5 py-3 text-[11.5px] font-bold uppercase tracking-[0.08em]">
            One Pan to Rule Them All
            <span className="font-semibold tracking-[0.04em] opacity-80">
              p. 22
            </span>
          </div>
          <div className="px-5 pt-[18px] pb-5">
            <h3 className="font-display text-[19.5px] font-semibold leading-[1.28]">
              Spinach &amp; Cheddar Frittata
            </h3>
            <p className="mt-2 text-[13.5px] text-ink-soft">
              All the awesomeness of an omelet without the folding — stovetop
              then baked until puffy.
            </p>
            <p className="mt-3 text-[12.5px] text-ink-faint italic">
              eggs · baby spinach · sharp cheddar · onion
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}

export default App;
