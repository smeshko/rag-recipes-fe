import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";
import {
  answersHandler,
  FALLBACK_WARNING,
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
const askButton = () => screen.getByRole("button", { name: "Ask" });

async function settleGrid() {
  await waitFor(() =>
    expect(screen.getByText(/matches|nothing for that/i)).toBeInTheDocument(),
  );
}

describe("ask affordance", () => {
  it("Enter submits search only — no /answers request", async () => {
    const user = userEvent.setup();
    const router = renderAt("/");
    await user.type(searchBox(), "frittata{Enter}");
    await waitFor(() =>
      expect(router.state.location.search).toBe("?q=frittata"),
    );
    await settleGrid();
    expect(answersCalls).toHaveLength(0);
  });

  it("Ask fires exactly one POST and preserves ?mode=vector", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    const router = renderAt("/?q=breakfast&mode=vector");
    await settleGrid();
    await user.click(askButton());
    await waitFor(() => expect(answersCalls).toHaveLength(1));
    expect(answersCalls[0]?.body).toEqual({
      query: "breakfast",
      retrieval: { mode: "vector" },
      answer: { include_results: false },
    });
    expect(router.state.location.search).toBe("?q=breakfast&mode=vector");
  });

  it("Ask with edited input commits the new ?q= and asks about it", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    const router = renderAt("/?q=frittata");
    await settleGrid();
    await user.clear(searchBox());
    await user.type(searchBox(), "weekend brunch");
    await user.click(askButton());
    await waitFor(() => expect(answersCalls).toHaveLength(1));
    const firstBody = answersCalls[0]?.body as { query: string } | undefined;
    expect(firstBody?.query).toBe("weekend brunch");
    expect(router.state.location.search).toBe("?q=weekend+brunch");
    /* The Ask-initiated q change must not self-clear the pending answer. */
    await waitFor(() =>
      expect(screen.queryByTestId("answer-skeleton")).toBeNull(),
    );
    expect(answersCalls).toHaveLength(1);
  });

  it("Ask is inert on a whitespace-only query", async () => {
    const user = userEvent.setup();
    renderAt("/");
    expect(askButton()).toBeDisabled();
    await user.type(searchBox(), "   ");
    expect(askButton()).toBeDisabled();
    expect(answersCalls).toHaveLength(0);
  });

  it("mode chip click after an answer does not refire /answers", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    renderAt("/?q=breakfast");
    await settleGrid();
    await user.click(askButton());
    await waitFor(() => expect(answersCalls).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Vector only" }));
    await settleGrid();
    expect(answersCalls).toHaveLength(1);
  });

  it("a new query via Enter clears the answer state", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    renderAt("/?q=breakfast");
    await settleGrid();
    await user.click(askButton());
    /* Pending skeleton appears while the LLM works. */
    await waitFor(() =>
      expect(screen.queryByTestId("answer-skeleton")).toBeNull(),
    );
    await user.clear(searchBox());
    await user.type(searchBox(), "scones{Enter}");
    await settleGrid();
    /* Mutation reset: no answer artifacts and no new POST. */
    expect(screen.queryByTestId("answer-skeleton")).toBeNull();
    /* The card itself is gone, and the live region does not keep claiming an
       answer is ready for a query it was never asked about. */
    expect(screen.queryByText(/Grounded in your books/)).toBeNull();
    expect(screen.getByTestId("answer-status")).toHaveTextContent("");
    expect(answersCalls).toHaveLength(1);
  });

  it("rapid repeated Ask clicks buy exactly one LLM round-trip", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    renderAt("/?q=breakfast");
    await settleGrid();
    /* Two clicks dispatched inside one frame — no re-render in between, so
       the disabled attribute cannot have applied yet. Only the synchronous
       in-flight latch can stop the second one. */
    const button = askButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(answersCalls).toHaveLength(1));
    /* And the button is disabled for the duration of the flight. */
    await waitFor(() => expect(askButton()).toBeEnabled());
    expect(answersCalls).toHaveLength(1);

    /* The latch releases: a later Ask on a new query still works. */
    await user.clear(searchBox());
    await user.type(searchBox(), "scones");
    await user.click(askButton());
    await waitFor(() => expect(answersCalls).toHaveLength(2));
  });

  it("a q change mid-flight does not latch Ask off permanently", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    renderAt("/?q=breakfast");
    await settleGrid();
    fireEvent.click(askButton());
    /* Reset the mutation mid-flight by changing ?q= — this detaches the
       observer, so anything keyed to a per-mutate callback would stick. */
    await user.clear(searchBox());
    await user.type(searchBox(), "scones{Enter}");
    await settleGrid();
    await waitFor(() => expect(askButton()).toBeEnabled());
    await user.click(askButton());
    await waitFor(() => expect(answersCalls).toHaveLength(2));
  });

  it("announces the answer lifecycle in a polite live region", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    renderAt("/?q=breakfast");
    await settleGrid();
    /* Present from mount, empty — a live region injected together with its
       content is announced unreliably. */
    const region = screen.getByTestId("answer-status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("");
    /* Not a second role="status" node: the fallback notice must stay the
       uniquely addressable one. */
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(askButton());
    expect(region).toHaveTextContent("Asking the shelf…");
    await waitFor(() =>
      expect(region).toHaveTextContent("The answer is ready."),
    );
  });

  it("stays silent on the fallback path — the notice announces itself", async () => {
    server.use(answersHandler(fallbackWithResultsFixture));
    const user = userEvent.setup();
    renderAt("/?q=wine+pairing");
    await settleGrid();
    await user.click(askButton());
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(FALLBACK_WARNING);
    /* Blank, so the warning is not announced twice. */
    expect(screen.getByTestId("answer-status")).toHaveTextContent("");
  });

  it("deep-loading /?q= fires no /answers", async () => {
    /* No answers handler registered — the unhandled-request guard is the
       second backstop behind the spy. */
    renderAt("/?q=frittata");
    await settleGrid();
    expect(answersCalls).toHaveLength(0);
  });
});
