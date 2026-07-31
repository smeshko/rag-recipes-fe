import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
  type AnswerResponse,
  type ApiError,
  isFallback,
  useAnswer,
  useShelfStats,
} from "../../api";
import { type SearchMode, useSearch } from "../../api/search";
import { Bloom, SearchInput } from "../../ui";
import { AnswerCard } from "./AnswerCard";
import { AnswerError } from "./AnswerError";
import { AnswerSkeleton } from "./AnswerSkeleton";
import { FallbackNotice } from "./FallbackNotice";
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

/* The answer slot's four arms in one place so SearchPage stays readable. */
function AnswerSection({
  answer,
  q,
  mode,
  onRephrase,
  onRetry,
}: {
  answer: {
    isPending: boolean;
    isSuccess: boolean;
    isError: boolean;
    data: AnswerResponse | undefined;
    error: unknown;
  };
  q: string;
  mode: SearchMode;
  onRephrase: () => void;
  onRetry: () => void;
}) {
  if (answer.isPending) {
    return <AnswerSkeleton />;
  }
  if (answer.isError) {
    return <AnswerError error={answer.error as ApiError} onRetry={onRetry} />;
  }
  if (answer.isSuccess && answer.data) {
    if (isFallback(answer.data)) {
      return (
        <FallbackNotice
          warnings={answer.data.warnings}
          hasResults={answer.data.results.length > 0}
          onRephrase={onRephrase}
        />
      );
    }
    return <AnswerCard answer={answer.data} q={q} mode={mode} />;
  }
  return null;
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const mode = parseMode(searchParams.get("mode"));

  /* The URL is the source of truth; local state only holds the in-progress
     typing. The effect resyncs the box on Back/Forward navigation. */
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const inputRef = useRef<HTMLInputElement>(null);

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

  /* Synchronous in-flight latch. answer.isPending only flips on the *next*
     render, so two clicks dispatched inside one frame would both pass an
     isPending check and buy two LLM round-trips. The disabled button is the
     visible layer; this ref closes the same-frame window behind it.
     Cleared by observing isPending rather than a per-mutate onSettled: a
     reset() during flight (a q change mid-answer) detaches the observer and
     that callback would never fire, latching Ask off forever. */
  const inFlight = useRef(false);
  useEffect(() => {
    if (!answer.isPending) {
      inFlight.current = false;
    }
  }, [answer.isPending]);

  const runAnswer = (vars: { query: string; mode: SearchMode }) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    answer.mutate(vars);
  };

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
    runAnswer({ query: asked, mode });
  };

  const rephrase = () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  /* The fallback grid replaces 2.1's section only while the answer still
     matches the current search — /answers ran its own retrieval at the
     answer-time mode, so after a chip toggle the live grid returns. */
  const fallbackData =
    answer.isSuccess && answer.data && isFallback(answer.data)
      ? answer.data
      : null;
  const answerMatchesSearch = answer.variables?.mode === mode;
  const showFallbackGrid =
    fallbackData !== null &&
    fallbackData.results.length > 0 &&
    answerMatchesSearch;
  /* A zero-result fallback already says "nothing found" — don't say it twice. */
  const suppressSearchSection =
    showFallbackGrid || (fallbackData !== null && answerMatchesSearch);

  /* Two of the answer slot's four states carry no announcement of their own:
     the skeleton is aria-hidden and the answer card is plain content. A
     screen-reader user would click Ask and hear nothing, then nothing again
     when the answer landed. The fallback notice (role="status") and the
     error (role="alert") already announce, so they stay blank here rather
     than being read twice. Deliberately no role attribute — role="status"
     would make this a second status node and the notice would stop being
     uniquely addressable. */
  const answerStatus = answer.isPending
    ? "Asking the shelf…"
    : fallbackData === null && answer.isSuccess && answer.data
      ? "The answer is ready."
      : "";

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
          ref={inputRef}
          value={text}
          onChange={setText}
          onSubmit={() => writeParams(text, mode)}
          onAsk={askShelf}
          asking={answer.isPending}
        />
        <ModeChips active={mode} onSelect={(next) => writeParams(q, next)} />
      </Bloom>

      {/* Mounted unconditionally: a live region has to exist before its
          content changes for the change to be announced reliably. */}
      <p aria-live="polite" className="sr-only" data-testid="answer-status">
        {answerStatus}
      </p>

      {/* Answer slot: explicit-action only; fallback is never error UI. */}
      <AnswerSection
        answer={answer}
        q={q}
        mode={mode}
        onRephrase={rephrase}
        onRetry={() => {
          if (answer.variables) {
            runAnswer(answer.variables);
          }
        }}
      />

      {showFallbackGrid && fallbackData ? (
        <ResultsGrid
          results={fallbackData.results}
          q={q}
          mode={answer.variables?.mode ?? mode}
          bloomBase={0.24}
          heading={
            <>
              What the shelf <em className="text-apricot italic">does</em> know
            </>
          }
          subline={
            <>
              {fallbackData.results.length} match
              {fallbackData.results.length === 1 ? "" : "es"} · ranked by{" "}
              {answer.variables?.mode ?? mode} score
            </>
          }
        />
      ) : null}

      {/* Branch order matters; never isPending — a disabled query is pending
          forever, which would pin a skeleton on the bare /. */}
      {suppressSearchSection || q === "" ? null : search.isLoading ? (
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
