import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import {
  type AnswerAsk,
  type AnswerResponse,
  type ApiError,
  isFallback,
  type MenuAsk,
  type MenuResponse,
  useAnswer,
  useMenu,
  useShelfStats,
} from "../../api";
import { type SearchMode, useSearch } from "../../api/search";
import { SearchInput } from "../../ui";
import { isReviewIncluded } from "../library/presentation";
import { AnswerCard } from "./AnswerCard";
import { AnswerError } from "./AnswerError";
import { AnswerSkeleton } from "./AnswerSkeleton";
import {
  ACTION_LABELS,
  type ComposerAction,
  ComposerControls,
} from "./ComposerControls";
import { FallbackNotice } from "./FallbackNotice";
import { clearLastSearch, saveLastSearch } from "./lastSearch";
import { MenuCard } from "./MenuCard";
import { MenuSkeleton } from "./MenuSkeleton";
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
    return <span className="text-fg-subtle">shelf stats unavailable</span>;
  }
  if (cookbookCount === undefined) {
    return <span className="text-fg-subtle">warming up the shelf…</span>;
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

/* The menu slot's three arms. No fallback branch: a fallback menu still
   carries courses, so MenuCard renders it with the warning inline. */
function MenuSection({
  menu,
  onRetry,
}: {
  menu: {
    isFetching: boolean;
    isError: boolean;
    data: MenuResponse | undefined;
    error: unknown;
  };
  onRetry: () => void;
}) {
  if (menu.isFetching) {
    return <MenuSkeleton />;
  }
  if (menu.isError) {
    return <AnswerError error={menu.error as ApiError} onRetry={onRetry} />;
  }
  if (menu.data) {
    return <MenuCard menu={menu.data} />;
  }
  return null;
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const q = searchParams.get("q") ?? "";
  const mode = parseMode(searchParams.get("mode"));
  /* Armed by the library's "Open review queue →" link-out; read-only in v1
     (no toggle UI on this screen — epic 03 owns the contract). */
  const reviewIncluded = isReviewIncluded(searchParams);

  /* The URL is the source of truth for what HAPPENED; local state holds the
     in-progress draft — what will happen next. Three things are draft now, not
     one: the query text, the action, and the retrieval mode. Each resyncs from
     the URL on Back/Forward, which is what makes the composer describe the
     entry you land on rather than the one you left.

     COMMITTED, from the URL — the entry's own record of what was run. Exactly
     one of the three is true, because nextSearchParams keeps `asked` and
     `menu` mutually exclusive. */
  const committedAction: ComposerAction =
    searchParams.get("asked") === "1"
      ? "ask"
      : searchParams.get("menu") === "1"
        ? "menu"
        : "search";

  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const [action, setAction] = useState<ComposerAction>(committedAction);
  useEffect(() => setAction(committedAction), [committedAction]);
  const [draftMode, setDraftMode] = useState(mode);
  useEffect(() => setDraftMode(mode), [mode]);
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
  /* The menu ask, same construction: `?menu=1` on this entry says the cache
     entry for this question's menu belongs on screen. Exclusive with `asked`
     by nextSearchParams' rule, so at most one AI slot is ever armed. */
  const menuAsk: MenuAsk | null =
    q !== "" && searchParams.get("menu") === "1"
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
    options?: { asked?: boolean; menu?: boolean },
  ) => {
    const commit = {
      q: nextQ,
      mode: nextMode,
      asked: options?.asked === true,
      menu: options?.menu === true,
    };
    /* A commit that changes nothing is not a history entry (review #1.1). A
       second Ask on the question already on screen — the button re-enables
       the moment the answer lands — recomputes the same search, and
       setSearchParams would push it regardless. The user then has to press
       Back twice to leave the answered entry, the first press visibly doing
       nothing, which is exactly what "Back/Forward across an ask lands on the
       right answer state" says must not happen.

       Compared against what this URL would be spelled as under the same
       rules, not against its literal bytes (review #2.1): a hand-typed
       ?mode=vector&q=x&asked=1 differs byte-wise from the canonical
       ?q=x&mode=vector&asked=1 while describing the same search, and pushing
       that is the same dead Back press. Same question, different spelling
       still commits — with `replace`, so the URL normalises without growing
       the history. */
    const committed = nextSearchParams(searchParams, commit);
    const canonicalHere = nextSearchParams(searchParams, {
      q,
      mode,
      asked: searchParams.get("asked") === "1",
      menu: searchParams.get("menu") === "1",
    });
    if (committed.toString() !== canonicalHere.toString()) {
      setSearchParams((prev) => nextSearchParams(prev, commit));
    } else if (committed.toString() !== searchParams.toString()) {
      setSearchParams((prev) => nextSearchParams(prev, commit), {
        replace: true,
      });
    }
    /* Beside the setSearchParams call, not inside its updater — the updater
       stays pure and React may invoke it more than once. This one site covers
       Enter, Ask and the mode chips alike. Emptying a committed query
       deliberately forgets the remembered search: an emptied box must not
       resurrect through the Cook row. Guarded on the previous q: on the bare
       / (the wordmark, Back to the initial entry, the BackLink's "Back to
       Cook") a mode-chip click also commits an empty q, and that must not wipe
       a search the user never had on screen (review #1.1). */
    if (nextQ) {
      saveLastSearch(searchUrl(committed));
    } else if (q !== "") {
      clearLastSearch();
    }
  };

  /* Vetoed unless the committed action is a plain Search. Ask and Compose run
     their own retrieval server-side, so firing /search beside them would buy a
     result set nobody asked for and stack a ten-card grid under the answer —
     the exact thing the action selector exists to prevent. The veto is on the
     COMMITTED action, not the draft: selecting "Ask" must not blank a grid
     that is still legitimately on screen from the last search. */
  const search = useSearch(
    q,
    mode,
    reviewIncluded,
    committedAction === "search",
  );
  /* Render what the data says, not what the URL says: during a mode change
     the grid still holds the previous mode's results (D7's placeholder), so
     the header label and every card's return target must use the mode that
     produced them. Falls back to the URL's mode only when there is no data
     to describe. */
  const results = search.data?.results ?? [];
  const resultsMode = search.resultsMode;

  /* The search those held-over cards actually came out of (review #2.2). The
     same nextSearchParams rule that writes the URL, with the producing mode
     substituted for the URL's — so this is the URL verbatim whenever the two
     agree (every render but the in-flight window of a mode change), and never
     a second hand-rolled spelling of the param rules. */
  const resultsParams = nextSearchParams(searchParams, {
    q,
    mode: resultsMode,
    asked: searchParams.get("asked") === "1",
    menu: searchParams.get("menu") === "1",
  });
  const resultsFrom = {
    pathname: location.pathname,
    search: resultsParams.toString() === "" ? "" : `?${resultsParams}`,
  };

  /* Reads the cache for `ask` and never fetches by itself, so a remount — Back
     from a recipe, Forward across the Ask click, a bookmarked ?asked=1 — reads
     whatever the cache holds and no navigation can produce a round-trip. On a
     cold load the entry is simply empty and the slot renders nothing. run() is
     the single thing that spends. */
  const answer = useAnswer(ask);
  const menu = useMenu(menuAsk);

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
    const next: AnswerAsk = { query: asked, mode: draftMode, reviewIncluded };
    writeParams(asked, draftMode, { asked: true });
    answer.run(next);
  };

  /* The menu twin of askShelf: commit ?menu=1 (which drops asked=1), then
     fetch by key. */
  const composeMenu = () => {
    const asked = text.trim();
    if (asked === "") {
      return;
    }
    const next: MenuAsk = { query: asked, mode: draftMode, reviewIncluded };
    writeParams(asked, draftMode, { menu: true });
    menu.run(next);
  };

  /* The single entry point for "run it". The menus only ever change the draft;
     this is the one place a request is bought, and it buys exactly one. */
  const submit = () => {
    if (action === "ask") {
      askShelf();
      return;
    }
    if (action === "menu") {
      composeMenu();
      return;
    }
    writeParams(text, draftMode);
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
    : menu.isFetching
      ? "Composing a menu…"
      : fallbackData === null && answer.data !== undefined
        ? "The answer is ready."
        : menu.data !== undefined
          ? "The menu is ready."
          : "";

  return (
    <div data-testid="search-page" aria-busy={search.isFetching}>
      {/* The greeting sits directly on the composer, the way the target's
          empty state does: one line, one weight, no ornament. It used to be a
          46px display serif with a terracotta italic clause — the single most
          branded thing on the app, and the first casualty of the re-skin.
          30px/semibold is the target's own greeting size.

          48px of dead space above the fold is a desktop luxury: on a phone it
          pushes the search field itself below the first screen. */}
      <div className="pt-12 pb-5 text-center max-[560px]:pt-6">
        <h1 className="text-[24px] leading-[1.3] max-[560px]:text-[21px]">
          Good morning. What are we cooking?
        </h1>
        <p className="mt-2 text-[13px] text-fg-subtle">
          <ShelfStatsLine />
        </p>
      </div>

      {/* 768px, the target's own composer column. Everything that used to sit
          in strips under this box — the two LLM buttons, the three mode chips
          — is now inside it, in the footer row. */}
      <div className="mx-auto max-w-[768px]">
        <SearchInput
          ref={inputRef}
          value={text}
          onChange={setText}
          onSubmit={submit}
          /* The button says what it will do. With three actions behind one
             selector, a button permanently labelled "Search" would be wrong
             two thirds of the time. */
          submitLabel={ACTION_LABELS[action]}
          controls={
            <ComposerControls
              action={action}
              onActionSelect={setAction}
              mode={draftMode}
              onModeSelect={setDraftMode}
              asking={answer.isFetching}
              composing={menu.isFetching}
            />
          }
        />
      </div>

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

      <MenuSection
        menu={menu}
        onRetry={() => {
          if (menuAsk !== null) {
            menu.run(menuAsk);
          }
        }}
      />

      {showFallbackGrid && fallbackData ? (
        <ResultsGrid
          results={fallbackData.results}
          /* The ask is read from this URL, so nothing is held over: the URL
             the reader is standing on IS the search that produced these. */
          from={location}
          bloomBase={0.24}
          heading={<>What the shelf does know</>}
          /* The count moves down here because the heading has taken the
             grid's own "N matches" slot. */
          subline={
            <>
              {fallbackData.results.length} match
              {fallbackData.results.length === 1 ? "" : "es"}
            </>
          }
        />
      ) : null}

      {/* The live search ladder, and ONLY when the committed action is a plain
          Search. Under Ask or Compose the /search query is vetoed (see
          useSearch above), so every arm below would be describing a request
          that was never made — `results.length === 0` in particular would
          render SearchEmpty's "nothing on the shelf" under a perfectly good
          answer. One condition governs both the fetch and the render, so they
          cannot disagree.

          Branch order matters; never isPending — a disabled query is pending
          forever, which would pin a skeleton on the bare /. */}
      {committedAction !== "search" ||
      showFallbackGrid ||
      q === "" ? null : search.isLoading ? (
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
          from={resultsFrom}
          dimmed={search.isPlaceholderData}
        />
      )}
    </div>
  );
}
