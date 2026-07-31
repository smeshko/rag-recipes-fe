import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { type ApiError, isFallback, useAnswer, useShelfStats } from "../../api";
import { type SearchMode, useSearch } from "../../api/search";
import { Bloom, SearchInput } from "../../ui";
import { AnswerCard } from "./AnswerCard";
import { AnswerSkeleton } from "./AnswerSkeleton";
import { ModeChips } from "./ModeChips";
import { ResultsGrid } from "./ResultsGrid";
import { SearchEmpty, SearchError, SearchSkeleton } from "./SearchStates";

const MODES = ["hybrid", "keyword", "vector"] as const;

function parseMode(raw: string | null): SearchMode {
  return MODES.includes(raw as SearchMode) ? (raw as SearchMode) : "hybrid";
}

function ShelfStatsLine() {
  const { cookbookCount, readyRecipes, partial, unavailable } = useShelfStats();
  /* Checked before the loading branch: a terminal list failure also leaves
     cookbookCount undefined, and "warming up the shelf…" would then sit there
     forever describing a request that is never coming back. */
  if (unavailable) {
    return <span className="text-ink-faint">shelf stats unavailable</span>;
  }
  if (cookbookCount === undefined) {
    return <span className="text-ink-faint">warming up the shelf…</span>;
  }
  /* A book whose counts failed to load makes the sum a floor, not a total —
     say so with a "+" rather than presenting a short number as exact. */
  const readyLabel =
    readyRecipes === undefined
      ? ""
      : ` · ${readyRecipes}${partial ? "+" : ""} recipes ready`;
  return (
    <>
      {cookbookCount} cookbook{cookbookCount === 1 ? "" : "s"} on the shelf
      {readyLabel}
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

  /* Functional updater so unknown params (e.g. epic 03's review=included)
     survive every write; hybrid stays out of the URL (D1). */
  const writeParams = (nextQ: string, nextMode: SearchMode) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (nextQ) {
        params.set("q", nextQ);
      } else {
        params.delete("q");
      }
      if (nextMode !== "hybrid") {
        params.set("mode", nextMode);
      } else {
        params.delete("mode");
      }
      return params;
    });
  };

  const search = useSearch(q, mode);
  /* Render what the data says, not what the URL says: during a mode change
     the grid still holds the previous mode's results (D7's placeholder), so
     the header label and every card's router state must use the mode that
     produced them. Falls back to the URL's mode only when there is no data
     to describe. */
  const results = search.data?.results ?? [];
  const resultsMode = search.resultsMode;

  const answer = useAnswer();
  const { reset } = answer;

  /* Reset guard: a q change clears the answer — except when the change was
     the Ask commit itself. The ref is set by our own code immediately before
     mutate(), so the guard never depends on mutation-dispatch timing. */
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (askedFor.current !== q) {
      askedFor.current = null;
      reset();
    }
  }, [q, reset]);

  /* URL commit before mutate — named so the ordering is testable. */
  const askShelf = () => {
    const asked = text.trim();
    if (asked === "") {
      return;
    }
    askedFor.current = asked;
    writeParams(asked, mode);
    answer.mutate({ query: asked, mode });
  };

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
          onAsk={askShelf}
        />
        <ModeChips active={mode} onSelect={(next) => writeParams(q, next)} />
      </Bloom>

      {/* Answer slot: explicit-action only. Fallback/error arms fill in
          TASK-004; a warning must never render as a grounded card. */}
      {answer.isPending ? (
        <AnswerSkeleton />
      ) : answer.isSuccess && !isFallback(answer.data) ? (
        <AnswerCard answer={answer.data} q={q} mode={mode} />
      ) : null}

      {/* Branch order matters; never isPending — a disabled query is pending
          forever, which would pin a skeleton on the bare /. */}
      {q === "" ? null : search.isLoading ? (
        <SearchSkeleton />
      ) : search.error ? (
        <SearchError
          error={search.error as ApiError}
          onRetry={() => search.refetch()}
        />
      ) : results.length === 0 ? (
        <SearchEmpty />
      ) : (
        <ResultsGrid
          results={results}
          q={q}
          mode={resultsMode}
          dimmed={search.isPlaceholderData}
        />
      )}
    </div>
  );
}
