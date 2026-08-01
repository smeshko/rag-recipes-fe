import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, request } from "./client";
import { route } from "./routes";
import type { components } from "./schema";
import type {
  DocumentDetailResponse,
  DocumentListItem,
  DocumentListResponse,
  DocumentStatus,
  IngestionStatusResponse,
  ReprocessResponse,
} from "./types";
import { TERMINAL_STATUSES } from "./types";

/* The backend pages this endpoint (default 50 rows, max 200) and returns no
   total, so a single unparameterised call silently truncates the shelf — and
   both `cookbookCount` and the ready-recipes fan-out treat what comes back as
   the whole of it. Walk pages until one comes back short. */
const LIST_PAGE_SIZE = 200;
/** Runaway guard, and deliberately a bound on REQUESTS rather than on
    documents: at most LIST_MAX_PAGES full-page requests plus the one short
    page that terminates the loop, so 26 requests worst case.

    It is therefore not an exact 5000-document quota — a shelf of 5001-5199
    terminates normally on that last short page and is returned in full. That
    is the intended trade: only a 26th *consecutive full* page proves the
    server is ignoring `offset`, and throwing on a merely-large-but-honest
    shelf would misreport a working list as unavailable, which is the failure
    this module already had once (see the isSuccess gate in LibraryPage). */
const LIST_MAX_PAGES = 25;

/**
 * Deliberately NOT an ApiError: `shouldRetry` must never rerun the runaway
 * loop (its 4xx branch would not catch a synthetic error, so without its own
 * branch this would retry twice with backoff).
 */
export class PaginationCapError extends Error {
  constructor(pages: number) {
    super(
      `The documents list did not terminate after ${pages} pages — is the server ignoring 'offset'?`,
    );
    this.name = "PaginationCapError";
  }
}

export async function fetchAllDocuments(): Promise<DocumentListResponse> {
  const documents: DocumentListItem[] = [];
  const seen = new Set<string>();

  for (let page = 0; page <= LIST_MAX_PAGES; page += 1) {
    const batch = await request<DocumentListResponse>(
      route("/documents", "get", {
        query: {
          limit: String(LIST_PAGE_SIZE),
          offset: String(page * LIST_PAGE_SIZE),
        },
      }),
    );
    for (const doc of batch.documents) {
      /* Offsets shift under a concurrent insert, which can repeat a row
         across pages; ids keep the shelf count honest either way. */
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        documents.push(doc);
      }
    }
    if (batch.documents.length < LIST_PAGE_SIZE) {
      return { documents };
    }
  }

  throw new PaginationCapError(LIST_MAX_PAGES + 1);
}

/** The single source of the ['documents'] cache entry — share, never inline.
    Phase 3.2's duplicate-detection snapshot consumes it so shapes match. */
export function documentsQueryOptions() {
  return queryOptions({
    queryKey: ["documents"],
    queryFn: fetchAllDocuments,
  });
}

export function useDocuments() {
  return useQuery(documentsQueryOptions());
}

/* The shared ['document', id] factory — 2.2's useDocument and the shelf
   fan-out both consume it, so the cache entry has exactly one shape. The
   enabled guard lives here because 2.2 calls it with an id that is
   undefined on first render (dependent query). */
export function documentDetailQueryOptions(id: string | undefined) {
  return queryOptions({
    queryKey: ["document", id],
    enabled: Boolean(id),
    queryFn: () =>
      request<DocumentDetailResponse>(
        route("/documents/{document_id}", "get", {
          params: { document_id: id as string },
        }),
      ),
  });
}

/** Detail-screen consumer of the shared factory (dependent query in 2.2). */
export function useDocument(id: string | undefined) {
  return useQuery(documentDetailQueryOptions(id));
}

/** N parallel detail fetches, cached per id — no batch endpoint exists. */
export function useDocumentDetails(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => documentDetailQueryOptions(id)),
  });
}

export interface ShelfStats {
  cookbookCount: number | undefined;
  /** Sum of `counts.ready_items`; `undefined` until every book has settled. */
  readyRecipes: number | undefined;
  /** True when at least one book's counts could not be fetched, so
      `readyRecipes` is a floor rather than an exact total. Lets the caller
      distinguish a short sum from a complete one — `readyRecipes: undefined`
      alone would conflate "still loading" with "one book failed". */
  partial: boolean;
  /** The shelf list itself failed terminally (401, exhausted 5xx retries,
      network). Without this the caller cannot tell a dead request from a slow
      one — `cookbookCount === undefined` means both — and would sit on a
      loading message forever. */
  unavailable: boolean;
}

/* Module-level combine keeps the reference stable across renders.

   The sum resolves once every detail query has SETTLED — success or error
   (TASK-001, D2). Waiting for all-success would hang the figure forever behind
   one 404/500, and the 1.2 client retries 5xx twice, so a failing book would
   flicker the hero.

   But settling on an error must not pass a short sum off as an exact total:
   summing the survivors silently published a plausible-but-false "N recipes
   ready". The failure is therefore reported rather than swallowed — `partial`
   marks the sum as a floor, which the hero renders as "212+". `readyRecipes`
   still resolves, which is what TASK-001 requires.

   An empty shelf is not an unknown one: zero books legitimately sum to 0
   (`every` on an empty array is true). The pre-load case is handled by the
   caller, which has no ids to fan out over until the list resolves. */
function combineReadyRecipes(
  results: {
    data?: DocumentDetailResponse;
    isSuccess: boolean;
    isError: boolean;
  }[],
): { readyRecipes: number | undefined; partial: boolean } {
  const allSettled = results.every((r) => r.isSuccess || r.isError);
  if (!allSettled) {
    return { readyRecipes: undefined, partial: false };
  }
  return {
    readyRecipes: results.reduce(
      (sum, r) => sum + (r.isSuccess ? (r.data?.counts.ready_items ?? 0) : 0),
      0,
    ),
    partial: results.some((r) => r.isError),
  };
}

export function useShelfStats(): ShelfStats {
  const documents = useDocuments();
  const ids = documents.data?.documents.map((d) => d.id) ?? [];

  const { readyRecipes, partial } = useQueries({
    queries: ids.map((id) => documentDetailQueryOptions(id)),
    combine: combineReadyRecipes,
  });

  return {
    cookbookCount: documents.data?.documents.length,
    /* Until the list resolves there is nothing to fan out over, and the
       combine's empty-array zero would read as "empty shelf" rather than
       "not known yet". */
    readyRecipes: documents.data ? readyRecipes : undefined,
    partial,
    unavailable: documents.isError,
  };
}

/* ------------------------------------------------------------------ */
/* Ingestion status polling (phase 3.3).                               */
/* ------------------------------------------------------------------ */

/** Production poll cadence. Tests inject `intervalMs` instead — ESM imports
    are read-only live bindings, so an exported const cannot be reassigned. */
export const POLL_INTERVAL_MS = 2500;

/** Stall budget: ≈100s at the production cadence. Only meaningful because
    the guard is armed solely in `queued`/`creating_source_spans`. */
export const POLL_STALL_LIMIT = 40;

/** Give up after this many consecutive failed poll ROUNDS (not retries —
    production allows 2 in-fetch retries, so this is up to 12 requests). */
const MAX_FAILED_ROUNDS = 4;

/**
 * Delay before the next poll round after `failedRounds` consecutive failed
 * rounds — `false` once the budget is spent. Extracted as a pure function
 * because it is the only place the widening cadence can be asserted
 * EXACTLY: a real-interval test can measure lower bounds, but proving
 * "widening rather than a fixed long delay" needs upper bounds, and upper
 * bounds over wall-clock gaps are precisely what a scheduler pause breaks.
 */
export function pollBackoffMs(
  intervalMs: number,
  failedRounds: number,
): number | false {
  return failedRounds >= MAX_FAILED_ROUNDS
    ? false
    : intervalMs * 2 ** failedRounds;
}

/** Why polling stopped — the UI branches its affordances on this. */
export type IngestionStopReason = "terminal" | "error" | "stalled" | null;

/**
 * Debounce window for the shared ['documents'] invalidation: a batch
 * finishing together would otherwise abort and restart 3.1's in-flight
 * fetch-all loop once per row (`invalidateQueries` defaults to
 * `cancelRefetch: true`) instead of coalescing.
 */
export const SHELF_INVALIDATION_DEBOUNCE_MS = 150;

/* Keyed per QueryClient, not per hook instance — the fan-in this blunts is
   N ROWS finishing together, and a per-instance timer cannot see across
   rows. WeakMap so a per-test client never leaks its timer to the next. */
const shelfInvalidationTimers = new WeakMap<
  QueryClient,
  ReturnType<typeof setTimeout>
>();

/** Every "the shelf is out of date" route goes through here, so the
    coalescing covers the 4xx stop as well as the terminal handoff. */
function invalidateShelfDebounced(queryClient: QueryClient): void {
  if (shelfInvalidationTimers.has(queryClient)) {
    return;
  }
  shelfInvalidationTimers.set(
    queryClient,
    setTimeout(() => {
      shelfInvalidationTimers.delete(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    }, SHELF_INVALIDATION_DEBOUNCE_MS),
  );
}

function invalidateOnTerminal(queryClient: QueryClient, id: string): void {
  /* `exact` matters: a bare ['document', id] prefix would also match
     ['document', id, 'status'] and refire the poll this stop just ended. */
  void queryClient.invalidateQueries({
    queryKey: ["document", id],
    exact: true,
  });
  invalidateShelfDebounced(queryClient);
}

/** The two states where a stall is diagnosable from this payload alone:
    the enqueue is best-effort (`queued`) and the span stage is exempt from
    the backend's stuck-job sweep (`creating_source_spans`). Everywhere
    else the signals are legitimately frozen — `extracting_items` holds
    both status and span count still for the whole extraction. */
function isTerminalStatus(status: DocumentStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

function stallGuardArmed(status: DocumentStatus): boolean {
  return status === "queued" || status === "creating_source_spans";
}

function is4xx(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500
  );
}

export function ingestionStatusQueryOptions(id: string) {
  return {
    /* No staleTime here — load-bearing: after a run ends the cached payload
       holds terminal: true, and a remount only resumes polling after a
       reprocess because staleTime 0 forces the mount refetch. */
    queryKey: ["document", id, "status"] as const,
    queryFn: () =>
      request<IngestionStatusResponse>(
        route("/documents/{document_id}/status", "get", {
          params: { document_id: id },
        }),
      ),
  };
}

export interface UseIngestionStatusOptions {
  enabled: boolean;
  intervalMs?: number;
  stallLimit?: number;
  /** The status the CALLER's list row is currently rendering. The hook
      cannot know it — `['documents']` is the row's source of truth for
      whether it shows as processing — and without it a payload that is
      terminal on the very first fetch is indistinguishable from a `failed`
      row being fetched once.

      Deliberately the status, not a `listTerminal` boolean: terminality
      alone cannot see a terminal→terminal disagreement. A list holding
      `failed` while another tab has already reprocessed the document to
      `ready` is terminal on both sides, and a boolean would suppress the
      invalidation and leave the shelf falsely failed indefinitely.
      Omitted → every terminal payload counts as a disagreement, which is
      the safe default. See the terminal-handoff effect. */
  listStatus?: DocumentStatus;
}

export interface UseIngestionStatusResult {
  data: IngestionStatusResponse | undefined;
  error: unknown;
  isPending: boolean;
  stopReason: IngestionStopReason;
  /** Reset both counters, clear the stop, refetch — the UI's way back. */
  checkAgain: () => void;
}

/**
 * Poll GET /documents/{id}/status until it answers `terminal: true` — or
 * until one of the three degraded stops: a 4xx (hard stop, the row is
 * stale), ~4 consecutive failed rounds of 5xx/network (with 2× backoff
 * per round), or `stallLimit` unchanged polls while parked in an armed
 * state. On the non-terminal → terminal transition, invalidates
 * ['documents'] (debounced) and ['document', id] so the row re-renders
 * from fresh counts.
 */
export function useIngestionStatus(
  id: string,
  {
    enabled,
    intervalMs = POLL_INTERVAL_MS,
    stallLimit = POLL_STALL_LIMIT,
    listStatus,
  }: UseIngestionStatusOptions,
): UseIngestionStatusResult {
  const queryClient = useQueryClient();

  /* Counters and stopReason are useState, never refs: once a guard trips
     the interval returns false, the timer clears, and no further query
     update arrives — a ref-held stopReason would never reach the DOM. */
  const [stallCount, setStallCount] = useState(0);
  const [failedRounds, setFailedRounds] = useState(0);
  const [stopReason, setStopReason] = useState<IngestionStopReason>(null);

  /* Prev-value bookkeeping (safe as refs — they never render). */
  const lastSampleRef = useRef<{
    status: DocumentStatus;
    pages: number | null;
  } | null>(null);
  const prevTerminalRef = useRef<boolean | undefined>(undefined);
  const invalidatedAtRef = useRef(0);
  const processedDataAtRef = useRef(0);
  const processedErrorAtRef = useRef(0);
  const prevEnabledRef = useRef(enabled);
  const prevListStatusRef = useRef(listStatus);

  const query = useQuery({
    ...ingestionStatusQueryOptions(id),
    enabled,
    /* jsdom reports visibilityState "prerender" and TanStack skips interval
       refetches when unfocused; this also unfreezes real backgrounded tabs. */
    refetchIntervalInBackground: true,
    refetchInterval: (q) => {
      /* Computed per RENDER, not per poll (setOptions recomputes it every
         render) — it must stay a pure read of state; counting happens in
         the effects below, once per completed fetch.

         The error branch comes FIRST, and which outcome is current is
         decided by timestamps rather than by `data` being present. A failed
         refetch does not clear the previous payload, so after a reprocess —
         where the cache still holds the finished run's `terminal: true` —
         a leading `data?.terminal` check would hand that stale payload
         precedence over the error that just happened, return false, and
         kill polling after a single failed round: no backoff, and no
         stopReason either (one round is short of MAX_FAILED_ROUNDS), so
         the row freezes on the stepper with no "check again" to press. */
      const failing =
        q.state.error !== null &&
        q.state.errorUpdatedAt >= q.state.dataUpdatedAt;
      if (failing) {
        if (is4xx(q.state.error)) {
          return false;
        }
        return pollBackoffMs(intervalMs, failedRounds);
      }
      if (q.state.data?.terminal) {
        return false;
      }
      if (stallCount >= stallLimit) {
        return false;
      }
      return intervalMs;
    },
  });

  const { data, error, isPending, dataUpdatedAt, errorUpdatedAt, refetch } =
    query;

  /* Reset on the non-terminal ENTRY, never at mount: a shelf left open
     through one long ingest would otherwise hand the next reprocess a
     spent budget that trips on its first render.

     `enabled` going false→true is one entry, but NOT the only one. A
     `failed` row is already enabled (TASK-002 fetches it once), so when
     the list refreshes that row to `queued` — someone reprocessing from
     another tab, or the curl-only reuse/new-version modes this plan
     deliberately keeps out of the UI — `enabled` never moves. Nothing
     would then dislodge the previous run's cached `failed` payload:
     `staleTime` 0 only refetches on mount and this row never unmounted,
     so `refetchInterval` keeps reading `terminal: true` and returns
     false. The row renders a dead stepper, with `stopReason: 'terminal'`
     so not even "check again" appears. Detect the new run from the list
     status crossing terminal→non-terminal and refetch explicitly. */
  useEffect(() => {
    const enteredEnabled = !prevEnabledRef.current && enabled;
    const prevList = prevListStatusRef.current;
    const newRun =
      prevList !== undefined &&
      listStatus !== undefined &&
      isTerminalStatus(prevList) &&
      !isTerminalStatus(listStatus);
    prevEnabledRef.current = enabled;
    prevListStatusRef.current = listStatus;
    if (!enteredEnabled && !newRun) {
      return;
    }
    setStallCount(0);
    setFailedRounds(0);
    setStopReason(null);
    lastSampleRef.current = null;
    if (newRun) {
      /* Discard the finished run's history too — the next terminal payload
         belongs to a different run and must be judged on its own. */
      prevTerminalRef.current = undefined;
      void queryClient.invalidateQueries({
        queryKey: ["document", id, "status"],
      });
    }
  }, [enabled, listStatus, queryClient, id]);

  /* Count once per COMPLETED fetch, keyed on dataUpdatedAt — never inside
     refetchInterval (fires per render) and never keyed on `data` alone
     (structural sharing reuses the reference for an unchanged payload,
     which is exactly the stall case). The processed-at ref keeps counter
     updates from re-running the effect against the same fetch. */
  useEffect(() => {
    if (
      dataUpdatedAt === 0 ||
      dataUpdatedAt === processedDataAtRef.current ||
      data === undefined
    ) {
      return;
    }
    processedDataAtRef.current = dataUpdatedAt;
    setFailedRounds(0);

    if (data.terminal) {
      lastSampleRef.current = null;
      setStopReason("terminal");
      return;
    }

    const sample = {
      status: data.status,
      pages: data.progress.pages_processed,
    };
    const last = lastSampleRef.current;
    lastSampleRef.current = sample;

    /* First non-terminal payload or an armed-status change resets the
       budget; an unchanged payload only counts while the guard is armed. */
    if (last === null || last.status !== sample.status) {
      setStallCount(0);
      setStopReason(null);
      return;
    }
    if (stallGuardArmed(sample.status) && last.pages === sample.pages) {
      const next = stallCount + 1;
      setStallCount(next);
      setStopReason(next >= stallLimit ? "stalled" : null);
      return;
    }
    setStallCount(0);
    setStopReason(null);
  }, [dataUpdatedAt, data, stallCount, stallLimit]);

  /* Consecutive failed ROUNDS — never `fetchFailureCount`, which counts
     retries within one fetch and resets each fetch (production's 2 retries
     would read 3 after a single failed round). */
  useEffect(() => {
    if (
      errorUpdatedAt === 0 ||
      errorUpdatedAt === processedErrorAtRef.current ||
      !error
    ) {
      return;
    }
    processedErrorAtRef.current = errorUpdatedAt;
    if (is4xx(error)) {
      setStopReason("error");
      /* PLAN's own words for the 4xx outcome: "the row is simply stale —
         the fix is invalidating the list, not polling harder". The stop
         alone leaves a document the API no longer serves rendered as
         processing forever, because polling has just ended and
         refetchOnWindowFocus is false, so nothing else refreshes the
         shelf. "Check again" would only repeat the 404. */
      invalidateShelfDebounced(queryClient);
      return;
    }
    const next = failedRounds + 1;
    setFailedRounds(next);
    if (next >= MAX_FAILED_ROUNDS) {
      setStopReason("error");
    }
  }, [errorUpdatedAt, error, failedRounds, queryClient]);

  /* Terminal handoff — two ways to learn the run is over, and BOTH are
     needed. v5 removed onSuccess from useQuery, so an effect is the only
     legal home.

     1. We watched the flip ourselves: prev === false → true.
     2. The payload DISAGREES with the status the caller's list is showing.

     Arm 2 is not belt-and-braces. A bare `prev === false` predicate misses
     every ingest that finishes inside the gap between the list response and
     the first status poll — and after a reprocess, `prev` is the PREVIOUS
     run's `true`, so a fast second run reads `true → true`. In both cases
     polling then stops on the terminal payload while `['documents']` still
     says processing; with `refetchOnWindowFocus: false` and no interval
     left, nothing ever refreshes the list and the row is parked in the
     progress variant until a full page reload.

     Disagreement is a STATUS comparison, not a terminality one. What arm 2
     must not do is fire for a `failed` row, which TASK-002 fetches once
     precisely because it is terminal — that was the whole reason the
     predicate is not `prev !== next`. Such a row reports `failed` on both
     sides and stays suppressed. But a list holding `failed` while another
     tab has reprocessed the document to `ready` is terminal on both sides
     too, and that one MUST invalidate: a boolean cannot tell the two
     apart, a status can.

     Keyed on dataUpdatedAt so the re-render where the refreshed list
     changes `listStatus` cannot refire it against the same fetch. */
  useEffect(() => {
    const terminal = data?.terminal;
    const prev = prevTerminalRef.current;
    prevTerminalRef.current = terminal;
    if (terminal !== true || invalidatedAtRef.current === dataUpdatedAt) {
      return;
    }
    if (prev === false || data?.status !== listStatus) {
      invalidatedAtRef.current = dataUpdatedAt;
      invalidateOnTerminal(queryClient, id);
    }
  }, [data, dataUpdatedAt, listStatus, queryClient, id]);

  const checkAgain = useCallback(() => {
    setStallCount(0);
    setFailedRounds(0);
    setStopReason(null);
    lastSampleRef.current = null;
    void refetch();
  }, [refetch]);

  return { data, error, isPending, stopReason, checkAgain };
}

/* ------------------------------------------------------------------ */
/* Reprocess (phase 3.3).                                              */
/* ------------------------------------------------------------------ */

/** Whether a row polls is derived from the LIST status — so any outcome
    that means "the list is stale" must invalidate all three keys, or the
    row keeps rendering terminal and the poller never mounts. */
function invalidateAfterReprocess(queryClient: QueryClient, id: string): void {
  void queryClient.invalidateQueries({ queryKey: ["documents"] });
  void queryClient.invalidateQueries({
    queryKey: ["document", id],
    exact: true,
  });
  void queryClient.invalidateQueries({
    queryKey: ["document", id, "status"],
  });
}

/**
 * POST /documents/{id}/reprocess with mode fixed to `auto` (the epic's
 * contract; reuse/new-version modes stay curl-only). A 409
 * `ingestion_already_running` is a STATE REPORT, not an error: the doc is
 * genuinely running and the list is stale by definition, so it invalidates
 * the same three keys success does — the UI renders a calm notice and the
 * row starts polling. A 404 means the row is stale the other way:
 * refresh the list, surface nothing alarming.
 */
export function useReprocess(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      const body: components["schemas"]["ReprocessRequest"] = { mode: "auto" };
      return request<ReprocessResponse>(
        route("/documents/{document_id}/reprocess", "post", {
          params: { document_id: id },
        }),
        {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        },
      );
    },
    onSuccess: () => {
      invalidateAfterReprocess(queryClient, id);
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        return;
      }
      if (error.code === "ingestion_already_running") {
        invalidateAfterReprocess(queryClient, id);
        return;
      }
      if (error.code === "document_not_found") {
        void queryClient.invalidateQueries({ queryKey: ["documents"] });
      }
    },
  });
}
