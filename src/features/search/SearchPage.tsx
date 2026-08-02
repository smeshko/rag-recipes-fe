import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
  type AnswerAsk,
  type AnswerResponse,
  type ApiError,
  isFallback,
  useAnswer,
  useShelfStats,
} from "../../api";
import { type SearchMode, useSearch } from "../../api/search";
import { Bloom, SearchInput } from "../../ui";
import { isReviewIncluded } from "../library/presentation";
import { AnswerCard } from "./AnswerCard";
import { AnswerCta } from "./AnswerCta";
import { AnswerError } from "./AnswerError";
import { AnswerSkeleton } from "./AnswerSkeleton";
import { FallbackNotice } from "./FallbackNotice";
import { clearLastSearch, saveLastSearch } from "./lastSearch";
import { ModeChips } from "./ModeChips";
import { parseMode } from "./mode";
import { ResultsGrid } from "./ResultsGrid";
import { SearchEmpty, SearchError, SearchSkeleton } from "./SearchStates";
import { nextSearchParams, searchUrl } from "./searchUrl";

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
  onRephrase,
  onRetry,
}: {
  answer: {
    /* isFetching, never isPending: an answer query never fetches on its own,
       so it reports pending forever whether or not anything was asked. */
    isFetching: boolean;
    isError: boolean;
    data: AnswerResponse | undefined;
    error: unknown;
  };
  onRephrase: () => void;
  onRetry: () => void;
}) {
  /* In-flight wins over a cached answer: a retry, or a re-ask of a query that
     was answered earlier this session, must show the skeleton rather than
     leave the previous answer standing as if it were the new one. */
  if (answer.isFetching) {
    return <AnswerSkeleton />;
  }
  if (answer.isError) {
    return <AnswerError error={answer.error as ApiError} onRetry={onRetry} />;
  }
  if (answer.data) {
    if (isFallback(answer.data)) {
      return (
        <FallbackNotice
          warnings={answer.data.warnings}
          hasResults={answer.data.results.length > 0}
          onRephrase={onRephrase}
        />
      );
    }
    return <AnswerCard answer={answer.data} />;
  }
  return null;
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const mode = parseMode(searchParams.get("mode"));
  /* Armed by the library's "Open review queue →" link-out; read-only in v1
     (no toggle UI on this screen — epic 03 owns the contract). */
  const reviewIncluded = isReviewIncluded(searchParams);

  /* The URL is the source of truth; local state only holds the in-progress
     typing. The effect resyncs the box on Back/Forward navigation. */
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const inputRef = useRef<HTMLInputElement>(null);

  /* The ask whose answer belongs on this screen — the note that says which
     cache entry to read, not the answer itself. Derived from the URL, so it is
     per history entry: opening a recipe unmounts SearchPage, and coming back
     re-derives the same ask and re-reads the same cache entry. Back and
     Forward across the Ask click land on the right answer state for free,
     because the arming lives in the entry rather than beside it. */
  const ask: AnswerAsk | null =
    q !== "" && searchParams.get("asked") === "1"
      ? { query: q, mode, reviewIncluded }
      : null;

  /* The single URL-commit choke point. Every param rule — unknown params
     survive, hybrid stays out of the URL, `asked` only where it still
     describes the question — lives in nextSearchParams, called twice with the
     same commit: once inside the functional updater (which stays pure) and
     once against this render's params to build the string to remember. Same
     function, so the two cannot describe different searches (D12). */
  const writeParams = (
    nextQ: string,
    nextMode: SearchMode,
    options?: { asked?: boolean },
  ) => {
    const commit = {
      q: nextQ,
      mode: nextMode,
      asked: options?.asked === true,
    };
    setSearchParams((prev) => nextSearchParams(prev, commit));
    /* Beside the setSearchParams call, not inside its updater — the updater
       stays pure and React may invoke it more than once. This one site covers
       Enter, Ask and the mode chips alike. Emptying a committed query
       deliberately forgets the remembered search: an emptied box must not
       resurrect through the Cook pill. Guarded on the previous q: on the bare
       / (Back to the initial entry, the BackLink's "Back to Cook") a mode-chip
       click also commits an empty q, and that must not wipe a search the user
       never had on screen (review #1.1). */
    if (nextQ) {
      saveLastSearch(searchUrl(nextSearchParams(searchParams, commit)));
    } else if (q !== "") {
      clearLastSearch();
    }
  };

  const search = useSearch(q, mode, reviewIncluded);
  /* Render what the data says, not what the URL says: during a mode change
     the grid still holds the previous mode's results (D7's placeholder), so
     the header label and every card's router state must use the mode that
     produced them. Falls back to the URL's mode only when there is no data
     to describe. */
  const results = search.data?.results ?? [];
  const resultsMode = search.resultsMode;

  /* Reads the cache for `ask` and never fetches by itself, so a remount — Back
     from a recipe, Forward across the Ask click, a bookmarked ?asked=1 — reads
     whatever the cache holds and no navigation can produce a round-trip. On a
     cold load the entry is simply empty and the slot renders nothing. run() is
     the single thing that spends. */
  const answer = useAnswer(ask);

  /* URL commit, then fetch — the committed ?q=&asked=1 and the answer describe
     the same question. `next` is passed to run() rather than read back from
     searchParams: setSearchParams has not committed in this tick, and run()
     fetches by key precisely so it does not depend on the observer's current
     binding. No in-flight latch either: two clicks in one frame fetch the same
     key, and TanStack dedupes that into one round-trip. */
  const askShelf = () => {
    const asked = text.trim();
    if (asked === "") {
      return;
    }
    const next: AnswerAsk = { query: asked, mode, reviewIncluded };
    writeParams(asked, mode, { asked: true });
    answer.run(next);
  };

  const rephrase = () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  /* "An answer never appears for a query it wasn't asked about" is true by
     construction: the ask IS the cache key, so a q the user never asked about
     has no entry to read and the slot renders nothing. */

  /* The fallback grid replaces 2.1's section only while an ask is armed. No
     mode comparison left to make — the ask is read from the same URL the grid
     is, so its mode IS the URL's, and a chip toggle disarms rather than
     leaving a stale answer standing (D9/D10). */
  const fallbackData =
    answer.data && isFallback(answer.data) ? answer.data : null;
  const showFallbackGrid =
    fallbackData !== null && fallbackData.results.length > 0 && ask !== null;
  /* A zero-result fallback already says "nothing found" — don't say it twice.
     It suppresses *only* SearchEmpty, not the whole ladder (TASK-004): the
     2.1 section still owns the page, and /answers runs its own retrieval, so
     a live grid, a loading state or a search error must all still surface.
     Verified live: the two retrievals genuinely diverge — "xyzzy quantum
     blockchain tractor" gives /answers 10 results and /search 0. */
  const zeroResultFallback =
    fallbackData !== null && fallbackData.results.length === 0 && ask !== null;

  /* Every arm AnswerSection would render, in one predicate. */
  const answerSlotOccupied =
    answer.isFetching || answer.isError || answer.data !== undefined;

  /* CTA visibility (round-1 #4): offer the grounded answer only while a live
     grid is up and the answer slot is empty. Every occupied arm (skeleton,
     card, error, fallback notice — the notice already owns the "want an
     answer?" conversation) and every non-grid state (bare /, loading, search
     error, empty) hides it. */
  const showAnswerCta =
    q !== "" &&
    !answerSlotOccupied &&
    !search.isLoading &&
    !search.error &&
    results.length > 0;

  /* Two of the answer slot's four states carry no announcement of their own:
     the skeleton is aria-hidden and the answer card is plain content. A
     screen-reader user would click Ask and hear nothing, then nothing again
     when the answer landed. The fallback notice (role="status") and the
     error (role="alert") already announce, so they stay blank here rather
     than being read twice. Deliberately no role attribute — role="status"
     would make this a second status node and the notice would stop being
     uniquely addressable. */
  const answerStatus = answer.isFetching
    ? "Asking the shelf…"
    : fallbackData === null && answer.data !== undefined
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
          asking={answer.isFetching}
        />
        <ModeChips active={mode} onSelect={(next) => writeParams(q, next)} />
      </Bloom>

      {/* Mounted unconditionally: a live region has to exist before its
          content changes for the change to be announced reliably. */}
      <p aria-live="polite" className="sr-only" data-testid="answer-status">
        {answerStatus}
      </p>

      {/* Answer slot: explicit-action only; fallback is never error UI. No
          gate needed — the section reads one cache entry, and only the ask
          that produced it can address that entry. */}
      <AnswerSection
        answer={answer}
        onRephrase={rephrase}
        onRetry={() => {
          if (ask !== null) {
            answer.run(ask);
          }
        }}
      />

      {showAnswerCta ? (
        /* Disabled, not hidden, on an emptied draft: askShelf asks the draft
           and would silently no-op (review #1.2) — same guard as the bar. */
        <AnswerCta onAsk={askShelf} disabled={text.trim() === ""} />
      ) : null}

      {showFallbackGrid && fallbackData ? (
        <ResultsGrid
          results={fallbackData.results}
          /* The ask is read from this URL, so its mode and the URL's are the
             same one here. */
          mode={mode}
          bloomBase={0.24}
          heading={
            <>
              What the shelf <em className="text-apricot italic">does</em> know
            </>
          }
          subline={
            <>
              {fallbackData.results.length} match
              {fallbackData.results.length === 1 ? "" : "es"} · ranked by {mode}{" "}
              score
            </>
          }
        />
      ) : null}

      {/* Branch order matters; never isPending — a disabled query is pending
          forever, which would pin a skeleton on the bare /. */}
      {showFallbackGrid || q === "" ? null : search.isLoading ? (
        <SearchSkeleton />
      ) : search.error ? (
        <SearchError
          error={search.error as ApiError}
          onRetry={() => search.refetch()}
        />
      ) : results.length === 0 ? (
        zeroResultFallback ? null : (
          <SearchEmpty />
        )
      ) : (
        <ResultsGrid
          results={results}
          mode={resultsMode}
          dimmed={search.isPlaceholderData}
          /* The default subline hard-codes "needs-review excluded", which is
             a lie once the library's link-out has armed the filter. */
          subline={
            <>
              ranked by {resultsMode} score ·{" "}
              {reviewIncluded
                ? "needs-review included"
                : "needs-review excluded"}
            </>
          }
        />
      )}
    </div>
  );
}
