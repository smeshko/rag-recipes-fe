import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { ApiError, type HealthResponse, request, route } from "../../api";
import { Bloom, Card, Eyebrow, Pill, SearchInput } from "../../ui";

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

/* Static card specimens so the primitives have a live surface pre-epic-02. */
const SPECIMENS = [
  {
    accent: "terra",
    book: "Eat Drink Paleo",
    page: "pp. 33–35",
    title: "Hazelnut Pancakes with Blood Orange Sauce",
    sum: "Fluffy paleo hazelnut pancakes with a warm blood orange and vanilla butter sauce.",
    ing: "blood oranges · butter · vanilla bean · coconut sugar",
    meta: ["12 pancakes"],
  },
  {
    accent: "sage",
    book: "One Pan to Rule Them All",
    page: "p. 22",
    title: "Spinach & Cheddar Frittata",
    sum: "All the awesomeness of an omelet without the folding — stovetop then baked until puffy.",
    ing: "eggs · baby spinach · sharp cheddar · onion",
    meta: ["4–6 servings", "30 min"],
  },
  {
    accent: "butter",
    book: "Baking with Less Sugar",
    page: "pp. 32–33",
    title: "Pear-Cardamom-Walnut Scones",
    sum: "Cardamom-fragrant scones with sweet pears and toasted walnuts, enriched with crème fraîche.",
    ing: "pears · cardamom · walnuts · crème fraîche",
    meta: ["12 scones", "35–45 min"],
  },
] as const;

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";

  return (
    <div data-testid="search-page">
      <Bloom duration={0.7} delay={0.06} className="pt-16 pb-5 text-center">
        <h1 className="font-display text-[clamp(32px,4.4vw,46px)] font-medium leading-[1.2] tracking-[-0.01em]">
          Good morning.{" "}
          <em className="text-apricot italic">What are we cooking?</em>
        </h1>
        <p className="mt-2.5 text-[15px] text-ink-soft">
          {q ? (
            <>
              searching for <b data-testid="search-query">{q}</b> — results
              arrive with epic 02
            </>
          ) : (
            <span data-testid="search-query">
              the shelf is ready when you are
            </span>
          )}{" "}
          · <HealthProbe />
        </p>
      </Bloom>

      <Bloom duration={0.7} delay={0.12} className="mx-auto max-w-[720px]">
        {/* The URL is the source of truth for the field; SearchInput reseeds
            itself when this value moves (Back/Forward) without remounting. */}
        <SearchInput
          defaultValue={q}
          onSubmit={(text) => setSearchParams(text ? { q: text } : {})}
        />
      </Bloom>

      <Bloom duration={0.7} delay={0.2} className="mt-14 text-center">
        <Eyebrow>Grounded in your books · specimens</Eyebrow>
      </Bloom>

      <div className="mt-5 grid grid-cols-3 gap-[22px] max-[960px]:grid-cols-1">
        {SPECIMENS.map((s, i) => (
          <Bloom key={s.title} index={i} className="flex">
            <Card
              accent={s.accent}
              className="flex w-full flex-col"
              header={
                <>
                  {s.book}
                  <span className="font-semibold tracking-[0.04em] opacity-80">
                    {s.page}
                  </span>
                </>
              }
            >
              <h3 className="font-display text-[19.5px] font-semibold leading-[1.28]">
                {s.title}
              </h3>
              <p className="mt-2 flex-1 text-[13.5px] text-ink-soft">{s.sum}</p>
              <p className="mt-3 text-[12.5px] text-ink-faint italic">
                {s.ing}
              </p>
              <div className="mt-3.5 flex flex-wrap gap-2">
                {s.meta.map((m) => (
                  <Pill key={m}>{m}</Pill>
                ))}
              </div>
            </Card>
          </Bloom>
        ))}
      </div>
    </div>
  );
}
