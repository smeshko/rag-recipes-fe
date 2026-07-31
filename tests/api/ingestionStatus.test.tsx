import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
  SHELF_INVALIDATION_DEBOUNCE_MS,
  useIngestionStatus,
} from "../../src/api/documents";
import {
  documentNotFoundEnvelope,
  ingestionStatus,
  internalErrorEnvelope,
  statusErrorHandler,
  statusParkedHandler,
  statusQueueHandler,
} from "../msw/handlers";
import { server } from "../msw/server";

/* Real (short) intervals, never fake timers — fake timers fight TanStack's
   scheduler and MSW's async responses. 20ms polls; the negative assertions
   settle ~300ms (≥15 intervals), because a 3-interval window at these
   speeds fits inside one slow macrotask and proves nothing. */

const INTERVAL = 20;
const SETTLE = 300;

const DOC = "doc-under-ingest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function renderStatusHook(
  options: { enabled?: boolean; intervalMs?: number; stallLimit?: number } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(
    () =>
      useIngestionStatus(DOC, {
        enabled: options.enabled ?? true,
        intervalMs: options.intervalMs ?? INTERVAL,
        stallLimit: options.stallLimit,
      }),
    { wrapper },
  );
  return { client, ...hook };
}

describe("useIngestionStatus", () => {
  it("polls until the terminal payload, then the call count freezes", async () => {
    let calls = 0;
    server.use(
      statusQueueHandler(
        DOC,
        [
          ingestionStatus(DOC, "extracting_items", { pages_processed: 12 }),
          ingestionStatus(DOC, "embedding_chunks", {
            pages_processed: 212,
            pages_total: 312,
          }),
          ingestionStatus(DOC, "ready"),
        ],
        () => {
          calls += 1;
        },
      ),
    );
    const { result } = renderStatusHook();

    /* Growth first: polling is demonstrably happening... */
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(3));
    /* stopReason lands one effect pass after the data render — waitFor it. */
    await waitFor(() => expect(result.current.stopReason).toBe("terminal"));

    /* ...then a real settle window with zero further requests. An
       exhausted queue answers 500, so a stray poll would also flip the
       hook into an error state — assert both stay clean. */
    const frozen = calls;
    await sleep(SETTLE);
    expect(calls).toBe(frozen);
    expect(result.current.stopReason).toBe("terminal");
    expect(result.current.data?.status).toBe("ready");
  });

  it("exposes the full typed payload for the progress UI", async () => {
    server.use(
      statusParkedHandler(
        DOC,
        ingestionStatus(DOC, "embedding_chunks", {
          pages_processed: 212,
          pages_total: 312,
        }),
      ),
    );
    const { result } = renderStatusHook();
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toMatchObject({
      document_id: DOC,
      status: "embedding_chunks",
      progress: {
        stage: "embedding_chunks",
        message: null,
        pages_total: 312,
        pages_processed: 212,
      },
      terminal: false,
    });
  });

  it("backs off with widening gaps on 5xx and gives up after 4 failed rounds", async () => {
    const at: number[] = [];
    server.use(
      statusErrorHandler(DOC, 500, internalErrorEnvelope, () => {
        at.push(Date.now());
      }),
    );
    const { result } = renderStatusHook();

    await waitFor(() => expect(result.current.stopReason).toBe("error"), {
      timeout: 4000,
    });
    const rounds = at.length;
    expect(rounds).toBe(4);

    /* Widening cadence, not a fixed one: the gap after the third failure
       (interval × 2³ = 160ms) dwarfs the one after the first (40ms). */
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    expect(gaps[2]).toBeGreaterThan(gaps[0]);

    await sleep(SETTLE);
    expect(at.length).toBe(rounds);
  });

  it("hard-stops on a 404 without retrying", async () => {
    let calls = 0;
    server.use(
      statusErrorHandler(DOC, 404, documentNotFoundEnvelope(DOC), () => {
        calls += 1;
      }),
    );
    const { result } = renderStatusHook();

    await waitFor(() => expect(result.current.stopReason).toBe("error"));
    await sleep(SETTLE);
    expect(calls).toBe(1);
  });

  it("stops a document parked in creating_source_spans after stallLimit unchanged polls", async () => {
    let calls = 0;
    server.use(
      statusParkedHandler(
        DOC,
        ingestionStatus(DOC, "creating_source_spans", { pages_processed: 0 }),
        () => {
          calls += 1;
        },
      ),
    );
    const { result } = renderStatusHook({ stallLimit: 3 });

    await waitFor(() => expect(result.current.stopReason).toBe("stalled"));
    /* Entry poll + 3 unchanged rounds, then silence. */
    const frozen = calls;
    expect(frozen).toBe(4);
    await sleep(SETTLE);
    expect(calls).toBe(frozen);
  });

  it("keeps polling a document parked in extracting_items — the guard is never armed there", async () => {
    let calls = 0;
    server.use(
      statusParkedHandler(
        DOC,
        ingestionStatus(DOC, "extracting_items", { pages_processed: 40 }),
        () => {
          calls += 1;
        },
      ),
    );
    const { result } = renderStatusHook({ stallLimit: 3 });

    /* Far beyond the stall budget and still going: a healthy long
       extraction is never abandoned. */
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(10), {
      timeout: 4000,
    });
    expect(result.current.stopReason).toBeNull();
  });

  it("checkAgain() resets the counters and resumes a stalled row", async () => {
    let calls = 0;
    server.use(
      statusParkedHandler(
        DOC,
        ingestionStatus(DOC, "creating_source_spans", { pages_processed: 0 }),
        () => {
          calls += 1;
        },
      ),
    );
    const { result } = renderStatusHook({ stallLimit: 2 });

    await waitFor(() => expect(result.current.stopReason).toBe("stalled"));
    const stoppedAt = calls;
    await sleep(150);
    expect(calls).toBe(stoppedAt);

    result.current.checkAgain();

    /* Polling is genuinely back: the count grows past the stop... */
    await waitFor(() => expect(calls).toBeGreaterThan(stoppedAt + 1));
    /* ...and the still-parked doc takes a FULL fresh budget to re-stall
       (entry refetch + stallLimit unchanged polls) — proving both
       counters were actually reset, not resumed mid-budget. */
    await waitFor(() => expect(result.current.stopReason).toBe("stalled"));
    expect(calls).toBe(stoppedAt + 3);
  });

  it("issues zero requests while disabled", async () => {
    let calls = 0;
    server.use(
      statusParkedHandler(DOC, ingestionStatus(DOC, "queued"), () => {
        calls += 1;
      }),
    );
    renderStatusHook({ enabled: false });
    await sleep(200);
    expect(calls).toBe(0);
  });

  it("invalidates ['documents'] and ['document', id] exactly once on the non-terminal → terminal transition", async () => {
    server.use(
      statusQueueHandler(DOC, [
        ingestionStatus(DOC, "indexing", {
          pages_processed: 300,
          pages_total: 312,
        }),
        ingestionStatus(DOC, "ready"),
      ]),
    );
    const { client, result } = renderStatusHook();
    const spy = vi.spyOn(client, "invalidateQueries");

    await waitFor(() => expect(result.current.data?.terminal).toBe(true));
    /* The shelf invalidation is debounced to blunt batch fan-in. */
    await sleep(SHELF_INVALIDATION_DEBOUNCE_MS + 100);

    const keys = spy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(
      keys.filter((k) => k.length === 1 && k[0] === "documents"),
    ).toHaveLength(1);
    expect(
      keys.filter((k) => k[0] === "document" && k[1] === DOC && k.length === 2),
    ).toHaveLength(1);

    await sleep(SETTLE);
    expect(spy.mock.calls.length).toBe(2);
  });

  it("does not invalidate when the first payload is already terminal (failed row mounting)", async () => {
    server.use(statusQueueHandler(DOC, [ingestionStatus(DOC, "failed")]));
    const { client, result } = renderStatusHook();
    const spy = vi.spyOn(client, "invalidateQueries");

    await waitFor(() => expect(result.current.data?.terminal).toBe(true));
    await sleep(SHELF_INVALIDATION_DEBOUNCE_MS + 150);
    expect(spy).not.toHaveBeenCalled();
  });
});
