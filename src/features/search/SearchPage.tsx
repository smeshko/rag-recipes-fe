import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { ApiError, type HealthResponse, request, route } from "../../api";

const healthEndpoint = route("/health", "get");

/* Temporary probe carried over from phase 1.2 — replaced by the real search
   flow in epic 02. */
function HealthProbe() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => request<HealthResponse>(healthEndpoint),
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

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";

  return (
    <section data-testid="search-page" className="bloom pt-16 pb-5 text-center">
      <h1 className="font-display text-[clamp(32px,4.4vw,46px)] font-medium leading-[1.2] tracking-[-0.01em]">
        Good morning.{" "}
        <em className="text-apricot italic">What are we cooking?</em>
      </h1>
      <p className="mt-2.5 text-[15px] text-ink-soft">
        {q ? (
          <>
            searching for <b data-testid="search-query">{q}</b> — results arrive
            with epic 02
          </>
        ) : (
          <span data-testid="search-query">
            the shelf is ready when you are
          </span>
        )}{" "}
        · <HealthProbe />
      </p>
    </section>
  );
}
