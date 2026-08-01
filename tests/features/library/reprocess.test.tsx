import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type { DocumentListItem } from "../../../src/api";
import { routes } from "../../../src/routes";
import {
  documentDetailHandler,
  documentNotFoundEnvelope,
  ingestionAlreadyRunningEnvelope,
  ingestionStatus,
  internalErrorEnvelope,
  libraryBooks,
  reprocessErrorHandler,
  reprocessHandler,
  statusParkedHandler,
} from "../../msw/handlers";
import { server } from "../../msw/server";

const readyBook = libraryBooks[1]; /* One Pan to Rule Them All — ready */
const failedBook = libraryBooks[4]; /* modernist-bread-vol2.pdf — failed */

/* A mutable one-book list: the reprocess flow's whole point is that the row
   only re-renders non-terminal via the ['documents'] invalidation refetching
   this handler — no client-side status splicing. */
function renderShelfWith(book: () => DocumentListItem) {
  server.use(
    http.get("/api/v1/documents", () =>
      HttpResponse.json({ documents: [book()] }),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: ["/library"] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return client;
}

describe("useReprocess via the shelf row", () => {
  it("posts exactly {mode: 'auto'} and re-renders the row queued on success", async () => {
    let status: DocumentListItem["status"] = "ready";
    let body: unknown;
    server.use(
      documentDetailHandler(readyBook.list.id, readyBook.detail),
      statusParkedHandler(
        readyBook.list.id,
        ingestionStatus(readyBook.list.id, "queued"),
      ),
      reprocessHandler(readyBook.list.id, (received) => {
        body = received;
        status = "queued";
      }),
    );
    renderShelfWith(() => ({ ...readyBook.list, status }));

    await userEvent.click(
      await screen.findByRole("button", { name: /reprocess/i }),
    );

    expect(body).toEqual({ mode: "auto" });
    /* The invalidation refetches the list; the row leaves its terminal
       variant and the polling UI mounts. */
    expect(await screen.findByText("Queued")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reprocess/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a calm role=status notice on 409 — and invalidates ['documents'] so polling starts", async () => {
    let status: DocumentListItem["status"] = "ready";
    let statusPolls = 0;
    server.use(
      documentDetailHandler(readyBook.list.id, readyBook.detail),
      statusParkedHandler(
        readyBook.list.id,
        ingestionStatus(readyBook.list.id, "embedding_chunks", {
          pages_processed: 100,
          pages_total: 300,
        }),
        () => {
          statusPolls += 1;
        },
      ),
      reprocessErrorHandler(readyBook.list.id, 409, () => {
        /* The 409 means the list was stale — the backend is mid-run. */
        status = "embedding_chunks";
        return ingestionAlreadyRunningEnvelope(readyBook.list.id);
      }),
    );
    const client = renderShelfWith(() => ({ ...readyBook.list, status }));
    const spy = vi.spyOn(client, "invalidateQueries");

    await userEvent.click(
      await screen.findByRole("button", { name: /reprocess/i }),
    );

    const notice = await screen.findByText(/already processing — hang tight/i);
    expect(notice.closest("[role='status']")).not.toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    /* Asserted directly: the 409 branch invalidates the list key. */
    expect(
      spy.mock.calls.some((call) => {
        const key = (call[0] as { queryKey: unknown[] }).queryKey;
        return key.length === 1 && key[0] === "documents";
      }),
    ).toBe(true);

    /* And the row genuinely starts polling the running ingest. */
    expect(await screen.findByText("Embedding chunks")).toBeInTheDocument();
    await waitFor(() => expect(statusPolls).toBeGreaterThan(0));
  });

  it("surfaces a non-409 error as a real error", async () => {
    server.use(
      documentDetailHandler(readyBook.list.id, readyBook.detail),
      reprocessErrorHandler(
        readyBook.list.id,
        500,
        () => internalErrorEnvelope,
      ),
    );
    renderShelfWith(() => readyBook.list);

    await userEvent.click(
      await screen.findByRole("button", { name: /reprocess/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/something went wrong/i);
    expect(screen.queryByText(/already processing/i)).not.toBeInTheDocument();
  });

  it("Retry on a failed row fires the same mutation and clears the note once re-queued", async () => {
    let status: DocumentListItem["status"] = "failed";
    let body: unknown;
    server.use(
      documentDetailHandler(failedBook.list.id, failedBook.detail),
      /* Dynamic: the one-time failed fetch sees "failed"; the poller that
         mounts after the re-queue sees "queued". */
      http.get(`/api/v1/documents/${failedBook.list.id}/status`, () =>
        HttpResponse.json(ingestionStatus(failedBook.list.id, status)),
      ),
      reprocessHandler(failedBook.list.id, (received) => {
        body = received;
        status = "queued";
      }),
    );
    renderShelfWith(() => ({ ...failedBook.list, status }));

    expect(await screen.findByText("Ingestion failed.")).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: /retry/i }),
    );

    expect(body).toEqual({ mode: "auto" });
    expect(await screen.findByText("Queued")).toBeInTheDocument();
    expect(screen.queryByText("Ingestion failed.")).not.toBeInTheDocument();
  });

  it("handles a 404 on reprocess by refreshing the stale row away, with no alarm", async () => {
    let gone = false;
    server.use(
      documentDetailHandler(readyBook.list.id, readyBook.detail),
      http.get("/api/v1/documents", () =>
        HttpResponse.json({ documents: gone ? [] : [readyBook.list] }),
      ),
      reprocessErrorHandler(readyBook.list.id, 404, () => {
        gone = true;
        return documentNotFoundEnvelope(readyBook.list.id);
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/library"] });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /reprocess/i }),
    );

    /* The row disappears with the refreshed list — and nothing alarming. */
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: readyBook.list.title }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
