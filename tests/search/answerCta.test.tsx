import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";
import {
  answersErrorHandler,
  answersHandler,
  fallbackWithResultsFixture,
  groundedAnswerFixture,
} from "../msw/answers";
import { server } from "../msw/server";

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

let answersCalls: { body: unknown }[] = [];

beforeEach(() => {
  answersCalls = [];
  server.events.on("request:start", async ({ request }) => {
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/api/v1/answers"
    ) {
      answersCalls.push({ body: await request.clone().json() });
    }
  });
});

afterEach(() => {
  server.events.removeAllListeners();
});

const searchBox = () =>
  screen.getByRole("textbox", { name: "What are we cooking?" });
const cta = () => screen.queryByTestId("answer-cta");
const ctaButton = () => screen.getByRole("button", { name: "Ask the shelf" });

/* An /answers handler that never resolves — pins the mutation in its
   pending state so the skeleton arm can be asserted against. */
const answersHangingHandler = () =>
  http.post("/api/v1/answers", async () => {
    await delay("infinite");
    return HttpResponse.json(groundedAnswerFixture);
  });

async function settleGrid() {
  await waitFor(() =>
    expect(screen.getByText(/matches|nothing for that/i)).toBeInTheDocument(),
  );
}

describe("answer CTA", () => {
  it("appears above the grid after a plain search with no answer asked", async () => {
    renderAt("/?q=frittata");
    await settleGrid();
    expect(cta()).toBeInTheDocument();
    expect(cta()).toHaveTextContent("Get a grounded answer from your books");
    expect(answersCalls).toHaveLength(0);
  });

  it("is absent on the bare /", () => {
    renderAt("/");
    expect(cta()).toBeNull();
  });

  it("is absent while the answer is pending (skeleton up)", async () => {
    server.use(answersHangingHandler());
    renderAt("/?q=frittata");
    await settleGrid();
    fireEvent.click(ctaButton());
    await waitFor(() =>
      expect(screen.getByTestId("answer-skeleton")).toBeInTheDocument(),
    );
    expect(cta()).toBeNull();
  });

  it("is absent once the answer is shown", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    renderAt("/?q=breakfast");
    await settleGrid();
    await user.click(ctaButton());
    await waitFor(() =>
      expect(screen.getByText(/Grounded in your books/)).toBeInTheDocument(),
    );
    expect(cta()).toBeNull();
  });

  it("is absent on an answer error", async () => {
    server.use(answersErrorHandler("internal_error"));
    const user = userEvent.setup();
    renderAt("/?q=breakfast");
    await settleGrid();
    await user.click(ctaButton());
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(cta()).toBeNull();
  });

  it("is absent while the fallback notice owns the conversation", async () => {
    server.use(answersHandler(fallbackWithResultsFixture));
    const user = userEvent.setup();
    renderAt("/?q=wine+pairing");
    await settleGrid();
    await user.click(ctaButton());
    await screen.findByRole("status");
    expect(cta()).toBeNull();
  });

  it("click fires exactly one POST /answers; a double-click buys one", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    renderAt("/?q=breakfast");
    await settleGrid();
    /* Two clicks inside one frame — only the synchronous in-flight latch
       (shared with the bar's Ask) can stop the second dispatch. */
    const button = ctaButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(answersCalls).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByText(/Grounded in your books/)).toBeInTheDocument(),
    );
    expect(answersCalls).toHaveLength(1);
  });

  it("disables while the draft box is emptied — no dead click", async () => {
    /* The CTA asks the draft; with the box cleared (uncommitted) a click
       would silently no-op (review #1.2). Same guard as the bar's Ask. */
    const user = userEvent.setup();
    renderAt("/?q=frittata");
    await settleGrid();
    await user.clear(searchBox());
    expect(cta()).toBeInTheDocument();
    expect(ctaButton()).toBeDisabled();
    await user.type(searchBox(), "x");
    expect(ctaButton()).toBeEnabled();
  });

  it("answers the draft: an edited, unsubmitted input is committed and asked", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    const router = renderAt("/?q=frittata");
    await settleGrid();
    await user.clear(searchBox());
    await user.type(searchBox(), "weekend brunch");
    await user.click(ctaButton());
    await waitFor(() => expect(answersCalls).toHaveLength(1));
    const body = answersCalls[0]?.body as { query: string } | undefined;
    expect(body?.query).toBe("weekend brunch");
    expect(router.state.location.search).toBe("?q=weekend+brunch");
  });
});
