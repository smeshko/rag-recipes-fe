import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type {
  BatchUploadResponse,
  DocumentListItem,
  DocumentResponse,
} from "../../../src/api";
import { routes } from "../../../src/routes";
import {
  documentDetailHandler,
  documentsListHandler,
  libraryBookDetails,
  libraryBookList,
  libraryBooks,
  unsupportedFileTypeEnvelope,
  uploadBatchHandler,
  uploadDocumentHandler,
  uploadErrorHandler,
  uploadedDocument,
} from "../../msw/handlers";
import { server } from "../../msw/server";

const pdfFile = (name = "book.pdf") =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], name, {
    type: "application/pdf",
  });

function renderLibrary() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: ["/library"] });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const listItemOf = (doc: DocumentResponse): DocumentListItem => ({
  id: doc.id,
  category: doc.category,
  subcategory: doc.subcategory,
  title: doc.title,
  author: doc.author,
  source_type: doc.source_type,
  status: doc.status,
  active_source_version: doc.active_source_version,
});

const detailOf = (doc: DocumentResponse) => ({
  document: doc,
  counts: {
    source_spans: 0,
    knowledge_items: 0,
    ready_items: 0,
    needs_review_items: 0,
    chunks: 0,
  },
});

const dropFiles = (files: File[]) =>
  fireEvent.drop(screen.getByTestId("dropzone"), {
    dataTransfer: { files },
  });

describe("library dropzone", () => {
  it("drop of a new PDF creates the document and the queued row appears without reload", async () => {
    const shelfBooks = [...libraryBookList];
    const newDoc = uploadedDocument("book-new-drop", "Salt Fat Acid Heat");
    server.use(
      documentsListHandler(shelfBooks),
      ...libraryBooks.map((b) => documentDetailHandler(b.list.id, b.detail)),
      documentDetailHandler(newDoc.id, detailOf(newDoc)),
      http.post("/api/v1/documents", async ({ request }) => {
        await request.formData();
        await delay(50);
        shelfBooks.unshift(listItemOf(newDoc));
        return HttpResponse.json(
          { document: newDoc, ingestion: { status: "queued" } },
          { status: 201 },
        );
      }),
    );
    renderLibrary();
    await screen.findByRole("heading", { name: "One Pan to Rule Them All" });

    dropFiles([pdfFile("salt-fat-acid-heat.pdf")]);

    /* Busy state while the mutation runs. */
    expect(await screen.findByText("Adding to the shelf…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeDisabled();

    /* The shelf reflows from the ['documents'] invalidation — no reload. */
    expect(
      await screen.findByRole("heading", { name: "Salt Fat Acid Heat" }),
    ).toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: "Salt Fat Acid Heat" });
    const article = heading.closest("article");
    expect(article).not.toBeNull();
    expect(article).toHaveTextContent("Processing");
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Choose files" })).toBeEnabled();
  });

  it("picker duplicate renders the calm role=status notice and adds nothing", async () => {
    const existing = libraryBookDetails["book-one-pan"].document;
    server.use(
      documentsListHandler(libraryBookList),
      ...libraryBooks.map((b) => documentDetailHandler(b.list.id, b.detail)),
      uploadDocumentHandler(existing),
    );
    renderLibrary();
    await screen.findByRole("heading", { name: "One Pan to Rule Them All" });

    fireEvent.change(screen.getByTestId("dropzone-input"), {
      target: { files: [pdfFile("one-pan-again.pdf")] },
    });

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(
      "One Pan to Rule Them All is already on the shelf",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    /* Nothing was added: row count unchanged. */
    expect(screen.getAllByRole("article")).toHaveLength(5);
  });

  it("415 renders the inline role=alert message and the dropzone stays usable", async () => {
    server.use(
      documentsListHandler(libraryBookList),
      ...libraryBooks.map((b) => documentDetailHandler(b.list.id, b.detail)),
      uploadErrorHandler(415, unsupportedFileTypeEnvelope),
    );
    renderLibrary();
    await screen.findByRole("heading", { name: "One Pan to Rule Them All" });

    dropFiles([new File(["not a pdf"], "notes.txt", { type: "text/plain" })]);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Only PDFs can join the shelf");
    expect(screen.getByRole("button", { name: "Choose files" })).toBeEnabled();
    expect(screen.getAllByRole("article")).toHaveLength(5);
  });

  it("a lost response reads as indeterminate, not as a flat failure (review #1)", async () => {
    server.use(
      documentsListHandler(libraryBookList),
      ...libraryBooks.map((b) => documentDetailHandler(b.list.id, b.detail)),
      http.post("/api/v1/documents", () => HttpResponse.error()),
    );
    renderLibrary();
    await screen.findByRole("heading", { name: "One Pan to Rule Them All" });

    dropFiles([pdfFile("lost.pdf")]);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "The shelf never answered — if the book was added it will appear below.",
    );
    /* Never the raw client string, which asserts a definitive failure. */
    expect(alert).not.toHaveTextContent("The request never reached the shelf.");
  });

  it("multi-file drop renders the per-file summary with failed files listed", async () => {
    const batchResponse: BatchUploadResponse = {
      items: [
        {
          filename: "fresh.pdf",
          status: "created",
          document_id: "doc-batch-1",
          error: null,
        },
        {
          filename: "one-pan.pdf",
          status: "duplicate",
          document_id: "book-one-pan",
          error: null,
        },
        {
          filename: "three.txt",
          status: "error",
          document_id: null,
          error: "Only PDF uploads are supported.",
        },
      ],
      total: 3,
      created: 1,
      duplicates: 1,
      errors: 1,
    };
    server.use(
      documentsListHandler(libraryBookList),
      ...libraryBooks.map((b) => documentDetailHandler(b.list.id, b.detail)),
      uploadBatchHandler(batchResponse),
    );
    renderLibrary();
    await screen.findByRole("heading", { name: "One Pan to Rule Them All" });

    dropFiles([
      pdfFile("fresh.pdf"),
      pdfFile("one-pan.pdf"),
      pdfFile("three.txt"),
    ]);

    expect(
      await screen.findByText("1 added · 1 already on the shelf · 1 failed"),
    ).toBeInTheDocument();
    /* Batch error items render the backend's message string verbatim. */
    expect(
      screen.getByText(/three\.txt.*Only PDF uploads are supported\./),
    ).toBeInTheDocument();
  });

  it("Add books scrolls to the dropzone and re-fires on a repeat click", async () => {
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    server.use(
      documentsListHandler(libraryBookList),
      ...libraryBooks.map((b) => documentDetailHandler(b.list.id, b.detail)),
    );
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole("heading", { name: "One Pan to Rule Them All" });

    const addBooks = screen.getByRole("link", { name: "Add books" });
    expect(addBooks).toHaveAttribute("href", "/library#add");
    expect(addBooks).not.toHaveAttribute("aria-current");

    await user.click(addBooks);
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));

    /* Repeat click from /library#add: useLocation never observes native
       hashchange, so the effect keys on location.key and must re-fire. */
    await user.click(addBooks);
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(2));
  });

  it("Choose files opens the picker exactly once per click", async () => {
    server.use(
      documentsListHandler(libraryBookList),
      ...libraryBooks.map((b) => documentDetailHandler(b.list.id, b.detail)),
    );
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole("heading", { name: "One Pan to Rule Them All" });

    const clickSpy = vi.spyOn(window.HTMLInputElement.prototype, "click");
    try {
      /* The button must stop propagation — the whole zone is clickable, so
         a bubbling click would open the picker twice. */
      await user.click(screen.getByRole("button", { name: "Choose files" }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    } finally {
      clickSpy.mockRestore();
    }
  });
});
