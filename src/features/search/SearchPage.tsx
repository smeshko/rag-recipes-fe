import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useShelfStats } from "../../api";
import { type SearchMode, useSearch } from "../../api/search";
import { Bloom, SearchInput } from "../../ui";
import { ModeChips } from "./ModeChips";

const MODES = ["hybrid", "keyword", "vector"] as const;

function parseMode(raw: string | null): SearchMode {
  return MODES.includes(raw as SearchMode) ? (raw as SearchMode) : "hybrid";
}

function ShelfStatsLine() {
  const { cookbookCount, readyRecipes } = useShelfStats();
  if (cookbookCount === undefined) {
    return <span className="text-ink-faint">warming up the shelf…</span>;
  }
  return (
    <>
      {cookbookCount} cookbook{cookbookCount === 1 ? "" : "s"} on the shelf
      {readyRecipes !== undefined ? ` · ${readyRecipes} recipes ready` : ""}
    </>
  );
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const mode = parseMode(searchParams.get("mode"));

  /* The URL is the source of truth; local state only holds the in-progress
     typing. The effect resyncs the box on Back/Forward navigation. */
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);

  const writeParams = (nextQ: string, nextMode: SearchMode) => {
    const params: Record<string, string> = {};
    if (nextQ) {
      params.q = nextQ;
    }
    /* hybrid is the default — keep it out of the URL (D1). */
    if (nextMode !== "hybrid") {
      params.mode = nextMode;
    }
    setSearchParams(params);
  };

  const search = useSearch(q, mode);

  return (
    <div data-testid="search-page" aria-busy={search.isFetching}>
      <Bloom duration={0.7} delay={0.06} className="pt-16 pb-5 text-center">
        <h1 className="font-display text-[clamp(32px,4.4vw,46px)] font-medium leading-[1.2] tracking-[-0.01em]">
          Good morning.{" "}
          <em className="text-apricot italic">What are we cooking?</em>
        </h1>
        <p className="mt-2.5 text-[15px] text-ink-soft">
          <ShelfStatsLine />
        </p>
      </Bloom>

      <Bloom duration={0.7} delay={0.12} className="mx-auto max-w-[720px]">
        <SearchInput
          value={text}
          onChange={setText}
          onSubmit={() => writeParams(text, mode)}
        />
        <ModeChips active={mode} onSelect={(next) => writeParams(q, next)} />
      </Bloom>
    </div>
  );
}
