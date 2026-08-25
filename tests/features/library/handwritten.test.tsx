import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../../src/routes";
import {
  documentDetailHandler,
  documentsListHandler,
  handwrittenBook,
  libraryBookDetails,
  libraryBookList,
  libraryShelfHandlers,
} from "../../msw/handlers";
import { server } from "../../msw/server";

/* The shelf's side of manual recipes: the way in, and the one book on it that
   has no PDF behind it. */

function renderLibrary() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: ["/library"] });
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router };
}

/** The five mockup books plus the handwritten shelf. */
function shelfWithHandwritten() {
  return [
    documentsListHandler([handwrittenBook.list, ...libraryBookList]),
    documentDetailHandler(handwrittenBook.list.id, handwrittenBook.detail),
    ...Object.entries(libraryBookDetails).map(([id, detail]) =>
      documentDetailHandler(id, detail),
    ),
  ];
}

const bookRow = async (title: string) => {
  const heading = await screen.findByRole("heading", { name: title });
  const article = heading.closest("article");
  if (!article) throw new Error(`no <article> around '${title}'`);
  return within(article);
};

describe("the way in", () => {
  it("offers writing one by hand next to the dropzone", async () => {
    server.use(...libraryShelfHandlers());
    renderLibrary();

    const cta = await screen.findByTestId("write-by-hand");
    /* Carries where it was clicked from, so the form's back link and its
       Cancel both return to the shelf rather than guessing. */
    expect(cta).toHaveAttribute("href", "/recipes/new?from=%2Flibrary");
  });
});

describe("the handwritten shelf", () => {
  it("cannot be reprocessed", async () => {
    /* There is no PDF to re-extract, and the backend answers 400. Absent
       rather than disabled: a greyed-out button invites you to work out why. */
    server.use(...shelfWithHandwritten());
    renderLibrary();

    const handwritten = await bookRow("Handwritten");
    expect(
      handwritten.queryByRole("button", { name: /Reprocess/ }),
    ).not.toBeInTheDocument();

    const onePan = await bookRow("One Pan to Rule Them All");
    expect(
      await onePan.findByRole("button", { name: /Reprocess/ }),
    ).toBeInTheDocument();
  });

  it("does not claim any pages were scanned", async () => {
    server.use(...shelfWithHandwritten());
    renderLibrary();

    const handwritten = await bookRow("Handwritten");
    expect(await handwritten.findByText("written by hand")).toBeInTheDocument();
    expect(handwritten.queryByText(/pages scanned/)).not.toBeInTheDocument();
  });

  it("is still a book: it counts its recipes and opens", async () => {
    server.use(...shelfWithHandwritten());
    renderLibrary();

    const handwritten = await bookRow("Handwritten");
    expect(await handwritten.findByText("3")).toBeInTheDocument();
    expect(
      handwritten.getByRole("link", { name: "Handwritten" }),
    ).toHaveAttribute("href", "/library/doc_manual_shelf?from=%2Flibrary");
  });
});
