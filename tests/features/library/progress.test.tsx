import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { createMemoryRouter, MemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type { DocumentListItem } from "../../../src/api";
import {
  BookRow,
  type DetailState,
} from "../../../src/features/library/BookRow";
import {
  PIPELINE_STAGES,
  stageLabel,
  stageStates,
} from "../../../src/features/library/stages";
import { routes } from "../../../src/routes";
import {
  documentDetailHandler,
  documentNotFoundEnvelope,
  ingestionStatus,
  libraryBooks,
  statusErrorHandler,
  statusParkedHandler,
  statusQueueHandler,
} from "../../msw/handlers";
import { server } from "../../msw/server";

const DOC = "doc-progress";

const processingDoc = (
  status: DocumentListItem["status"],
): DocumentListItem => ({
  id: DOC,
  category: "recipes",
  subcategory: null,
  title: "The Green Roasting Tin",
  author: "Rukmini Iyer",
  source_type: "pdf",
  status,
  active_source_version: null,
});

const detailFor = (doc: DocumentListItem): DetailState => ({
  status: "success",
  detail: {
    document: {
      ...doc,
      asset_id: `asset-${doc.id}`,
      language: "en",
      created_at: "2026-07-31T09:56:00Z",
      updated_at: "2026-07-31T09:56:00Z",
    },
    counts: {
      source_spans: 0,
      knowledge_items: 0,
      ready_items: 0,
      needs_review_items: 0,
      chunks: 0,
    },
  },
});

function renderRow(
  doc: DocumentListItem,
  pollOptions?: { intervalMs?: number; stallLimit?: number },
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return {
    client,
    ...render(
      <BookRow doc={doc} detail={detailFor(doc)} pollOptions={pollOptions} />,
      { wrapper },
    ),
  };
}

describe("stageStates", () => {
  it("maps queued to an all-pending stepper", () => {
    expect(stageStates("queued")).toEqual(Array(7).fill("pending"));
  });

  it("marks the first stage current at extracting_text", () => {
    expect(stageStates("extracting_text")).toEqual([
      "now",
      ...Array(6).fill("pending"),
    ]);
  });

  it("marks exactly the prior stages done mid-pipeline", () => {
    expect(stageStates("validating_items")).toEqual([
      "done",
      "done",
      "done",
      "now",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("marks six done at indexing", () => {
    expect(stageStates("indexing")).toEqual([...Array(6).fill("done"), "now"]);
  });

  it("handles the reuse-reprocess shortcut: extracting_items implies Text and Spans done", () => {
    expect(stageStates("extracting_items")).toEqual([
      "done",
      "done",
      "now",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("labels every non-terminal status, including queued", () => {
    expect(stageLabel("queued")).toBe("Queued");
    expect(stageLabel("extracting_items")).toBe("Extracting recipes");
    expect(stageLabel("embedding_chunks")).toBe("Embedding chunks");
    expect(PIPELINE_STAGES.map((s) => s.label)).toEqual([
      "Text",
      "Spans",
      "Extract",
      "Validate",
      "Chunks",
      "Embed",
      "Index",
    ]);
  });
});

describe("IngestionProgress rendering", () => {
  it("renders the stage label, page numbers and proportional fill for a numeric payload", async () => {
    server.use(
      statusParkedHandler(
        DOC,
        ingestionStatus(DOC, "embedding_chunks", {
          pages_processed: 212,
          pages_total: 312,
        }),
      ),
    );
    renderRow(processingDoc("embedding_chunks"));

    expect(await screen.findByText("Embedding chunks")).toBeInTheDocument();
    /* findBy: the label renders from the list status before the first poll
       lands; the page numbers only exist once the payload arrives. */
    expect(await screen.findByText("212 / 312 pages")).toBeInTheDocument();

    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "212");
    expect(bar).toHaveAttribute("aria-valuemax", "312");
    const fill = within(bar).getByTestId("progress-fill");
    expect(fill.style.width).toBe(`${(212 / 312) * 100}%`);

    /* Stepper: five done, Embed current, Index pending. */
    const stepper = screen.getByRole("list", { name: /stages/i });
    const items = within(stepper).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items.filter((li) => li.textContent?.includes("✓"))).toHaveLength(5);
    const current = items.find(
      (li) => li.getAttribute("aria-current") === "step",
    );
    expect(current?.textContent).toContain("Embed");
  });

  it("clamps the fill at 100% when pages_processed exceeds pages_total", async () => {
    server.use(
      statusParkedHandler(
        DOC,
        ingestionStatus(DOC, "indexing", {
          pages_processed: 400,
          pages_total: 312,
        }),
      ),
    );
    renderRow(processingDoc("indexing"));

    const bar = await screen.findByRole("progressbar");
    const fill = within(bar).getByTestId("progress-fill");
    await waitFor(() => expect(fill.style.width).toBe("100%"));
  });

  it("renders the indeterminate bar with no page numbers while pages_total is null", async () => {
    server.use(
      statusParkedHandler(
        DOC,
        ingestionStatus(DOC, "extracting_text", { pages_processed: 0 }),
      ),
    );
    renderRow(processingDoc("extracting_text"));

    expect(await screen.findByText("Extracting text")).toBeInTheDocument();
    expect(screen.queryByText(/pages/)).not.toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar).not.toHaveAttribute("aria-valuemax");
  });

  it("renders the Queued label and an all-pending stepper for a queued document", async () => {
    server.use(statusParkedHandler(DOC, ingestionStatus(DOC, "queued")));
    renderRow(processingDoc("queued"));

    expect(await screen.findByText("Queued")).toBeInTheDocument();
    const stepper = screen.getByRole("list", { name: /stages/i });
    const items = within(stepper).getAllByRole("listitem");
    expect(items.filter((li) => li.textContent?.includes("✓"))).toHaveLength(0);
    expect(items.some((li) => li.getAttribute("aria-current") === "step")).toBe(
      false,
    );
  });
});

describe("stop states", () => {
  it("renders the error affordance with a working check-again after a 404", async () => {
    let calls = 0;
    server.use(
      statusErrorHandler(DOC, 404, documentNotFoundEnvelope(DOC), () => {
        calls += 1;
      }),
    );
    renderRow(processingDoc("extracting_items"));

    expect(
      await screen.findByText(/couldn't reach the shelf/i),
    ).toBeInTheDocument();
    const stopped = calls;

    await userEvent.click(screen.getByRole("button", { name: /check again/i }));
    await waitFor(() => expect(calls).toBeGreaterThan(stopped));
  });

  it("renders the stalled affordance, holds the bar, and check-again resumes polling", async () => {
    let calls = 0;
    server.use(
      statusParkedHandler(
        DOC,
        ingestionStatus(DOC, "creating_source_spans", { pages_processed: 4 }),
        () => {
          calls += 1;
        },
      ),
    );
    renderRow(processingDoc("creating_source_spans"), {
      intervalMs: 20,
      stallLimit: 2,
    });

    expect(
      await screen.findByText(/taking longer than expected/i),
    ).toBeInTheDocument();
    /* The bar holds its last position rather than disappearing. */
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    const stopped = calls;

    await userEvent.click(screen.getByRole("button", { name: /check again/i }));
    await waitFor(() => expect(calls).toBeGreaterThan(stopped + 1));
  });
});

describe("failed rows", () => {
  const failedDoc: DocumentListItem = {
    ...libraryBooks[4].list,
  };

  it("renders the generic failure note, the failed pill and no stepper", async () => {
    server.use(
      statusParkedHandler(
        failedDoc.id,
        ingestionStatus(failedDoc.id, "failed"),
      ),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <BookRow doc={failedDoc} detail={detailFor(failedDoc)} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Ingestion failed.")).toBeInTheDocument();
    expect(
      screen.getByText(/doesn't expose the reason yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: /stages/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("prefers progress.message when the API provides one", async () => {
    server.use(
      statusParkedHandler(
        failedDoc.id,
        ingestionStatus(failedDoc.id, "failed", {
          message: "Text extraction produced no pages.",
        }),
      ),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <BookRow doc={failedDoc} detail={detailFor(failedDoc)} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Text extraction produced no pages."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/doesn't expose the reason yet/i),
    ).not.toBeInTheDocument();
  });
});

describe("terminal handoff", () => {
  it("row leaves the progress variant after the terminal poll", async () => {
    /* The list flips server-side once ingestion ends; the row only leaves
         the progress variant via TASK-001's invalidation refetching it. */
    let bookNow = processingDoc("embedding_chunks");
    server.use(
      http.get("/api/v1/documents", () =>
        HttpResponse.json({ documents: [bookNow] }),
      ),
      documentDetailHandler(DOC, {
        document: {
          ...bookNow,
          asset_id: `asset-${DOC}`,
          language: "en",
          created_at: "2026-07-31T09:56:00Z",
          updated_at: "2026-07-31T09:56:00Z",
        },
        counts: {
          source_spans: 312,
          knowledge_items: 100,
          ready_items: 98,
          needs_review_items: 0,
          chunks: 500,
        },
      }),
      statusQueueHandler(DOC, [
        ingestionStatus(DOC, "embedding_chunks", {
          pages_processed: 212,
          pages_total: 312,
        }),
        ingestionStatus(DOC, "ready"),
      ]),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(routes, {
      initialEntries: ["/library"],
    });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Embedding chunks")).toBeInTheDocument();
    bookNow = { ...bookNow, status: "ready", active_source_version: 1 };

    /* The next poll lands at the production cadence (2.5s), flips
         terminal, and the invalidation re-renders the terminal row. */
    await waitFor(() => expect(screen.getByText("Ready")).toBeInTheDocument(), {
      timeout: 6000,
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("recipes")).toBeInTheDocument();
  }, 12000);
});
