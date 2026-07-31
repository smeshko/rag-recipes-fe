import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../../src/routes";
import {
  documentDetailHandler,
  documentsListHandler,
  libraryBookList,
  libraryBooks,
  libraryShelfHandlers,
} from "../../msw/handlers";
import { server } from "../../msw/server";

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

const bookRow = async (title: string) => {
  const heading = await screen.findByRole("heading", { name: title });
  const article = heading.closest("article");
  if (!article) throw new Error(`no <article> around '${title}'`);
  return within(article);
};

describe("library shelf", () => {
  it("renders one row per fixture book", async () => {
    server.use(...libraryShelfHandlers());
    renderLibrary();

    for (const book of libraryBooks) {
      expect(
        await screen.findByRole("heading", { name: book.list.title }),
      ).toBeInTheDocument();
    }
    expect(screen.getAllByRole("article")).toHaveLength(5);
  });

  it("maps every status to its pill text", async () => {
    server.use(...libraryShelfHandlers());
    renderLibrary();

    const onePan = await bookRow("One Pan to Rule Them All");
    expect(onePan.getByText("Ready")).toBeInTheDocument();

    const baking = await bookRow("Baking with Less Sugar");
    expect(await baking.findByText("14 need review")).toBeInTheDocument();

    const queued = await bookRow("The Green Roasting Tin");
    expect(queued.getByText("Processing")).toBeInTheDocument();

    const failed = await bookRow("modernist-bread-vol2.pdf");
    expect(failed.getByText("Failed")).toBeInTheDocument();
  });

  it("renders exactly three counts on ready-ish rows, from the API", async () => {
    server.use(...libraryShelfHandlers());
    renderLibrary();

    const onePan = await bookRow("One Pan to Rule Them All");
    expect(await onePan.findByText("107")).toBeInTheDocument();
    expect(onePan.getByText("1")).toBeInTheDocument();
    expect(onePan.getByText("535")).toBeInTheDocument();
    expect(onePan.getByText("recipes")).toBeInTheDocument();
    expect(onePan.getByText("to review")).toBeInTheDocument();
    expect(onePan.getByText("chunks")).toBeInTheDocument();
    /* Pages scanned is the subtitle, never a fourth count. */
    expect(await onePan.findByText("270 pages scanned")).toBeInTheDocument();
    expect(onePan.queryByText("pages")).not.toBeInTheDocument();
  });

  it("renders no counts row on non-terminal and failed rows", async () => {
    server.use(...libraryShelfHandlers());
    renderLibrary();

    const queued = await bookRow("The Green Roasting Tin");
    expect(
      await queued.findByText(/added .* · one-pan vegetarian/),
    ).toBeInTheDocument();
    expect(queued.queryByText("recipes")).not.toBeInTheDocument();
    expect(queued.queryByText("chunks")).not.toBeInTheDocument();

    const failed = await bookRow("modernist-bread-vol2.pdf");
    expect(failed.queryByText("recipes")).not.toBeInTheDocument();
    expect(failed.queryByText("to review")).not.toBeInTheDocument();
  });

  it("computes the header stats line from the fixture math", async () => {
    server.use(...libraryShelfHandlers());
    renderLibrary();

    expect(
      await screen.findByText(
        "3 books ready · 269 recipes · 15 waiting for review",
      ),
    ).toBeInTheDocument();
  });

  it("degrades visibly when one detail query 404s", async () => {
    /* Every book except Baking with Less Sugar gets a detail handler; the
       base catch-all 404s it. Sums exclude it: 107+105 = 212 recipes, 1
       waiting. */
    server.use(
      documentsListHandler(libraryBookList),
      ...libraryBooks
        .filter((b) => b.list.id !== "book-baking-less-sugar")
        .map((b) => documentDetailHandler(b.list.id, b.detail)),
    );
    renderLibrary();

    expect(
      await screen.findByText(
        "3 books ready · 212+ recipes · 1+ waiting for review",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("counts unavailable for 1 book"),
    ).toBeInTheDocument();

    /* The errored row: em-dash counts, numberless pill. */
    const baking = await bookRow("Baking with Less Sugar");
    expect(baking.getByText("Needs review")).toBeInTheDocument();
    expect(baking.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(baking.getByText("recipes")).toBeInTheDocument();
  });

  it("renders the themed empty state when the shelf is bare", async () => {
    server.use(documentsListHandler([]));
    renderLibrary();

    expect(
      await screen.findByText(/nothing on the shelf yet/i),
    ).toBeInTheDocument();
  });

  it("renders a loading skeleton while the list is pending", async () => {
    server.use(
      http.get("/api/v1/documents", async () => {
        await delay("infinite");
        return HttpResponse.json({ documents: [] });
      }),
    );
    renderLibrary();

    expect(await screen.findByTestId("shelf-loading")).toBeInTheDocument();
    /* Shelf chrome renders without layout jump. */
    expect(
      screen.getByRole("heading", { name: "On the shelf" }),
    ).toBeInTheDocument();
  });
});
