import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";
import {
  answersHandler,
  FALLBACK_WARNING,
  fallbackNoResultsFixture,
  fallbackWithResultsFixture,
  groundedAnswerFixture,
  NO_RESULTS_WARNING,
} from "../msw/answers";
import { server } from "../msw/server";
import {
  actionTrigger,
  chooseAction,
  chooseMode,
  runAiAction,
  submitButton,
} from "./composer";

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

let answersCalls = 0;

beforeEach(() => {
  answersCalls = 0;
  server.events.on("request:start", ({ request }) => {
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/api/v1/answers"
    ) {
      answersCalls += 1;
    }
  });
});

afterEach(() => {
  server.events.removeAllListeners();
});

async function ask() {
  const user = userEvent.setup();
  await waitFor(() => expect(actionTrigger()).toBeEnabled());
  await runAiAction(user, "Ask the shelf");
  return user;
}

describe("fallback", () => {
  it("renders the amber notice with the verbatim warning plus returned results", async () => {
    server.use(answersHandler(fallbackWithResultsFixture));
    renderAt("/?q=wine+pairing");
    await ask();
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(FALLBACK_WARNING);
    expect(
      within(notice).getByText(
        "warning: answer_fallback · retrieval still ran",
      ),
    ).toBeInTheDocument();
    /* No error semantics on the fallback path. */
    expect(screen.queryByRole("alert")).toBeNull();
    /* The fallback grid replaces the search grid with its own heading. */
    expect(await screen.findByText(/does/)).toBeInTheDocument();
    expect(screen.getByText("Spinach & Cheddar Frittata")).toBeInTheDocument();
    expect(screen.getByText("2 matches")).toBeInTheDocument();
  });

  it("zero-result fallback renders the notice alone — one empty surface", async () => {
    server.use(answersHandler(fallbackNoResultsFixture));
    renderAt("/?q=wine+pairing");
    await ask();
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(NO_RESULTS_WARNING);
    expect(within(notice).queryByText(/answer_fallback/)).toBeNull();
    /* SearchEmpty suppressed — the amber notice is the only empty state. */
    expect(screen.queryByText("The shelf has nothing for that.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("zero-result fallback still lets the live search grid own the page", async () => {
    /* The two retrievals genuinely diverge — verified live, where the same
       query gave /answers 10 results and /search 0. TASK-004: a zero-result
       fallback suppresses SearchEmpty only, never the whole 2.1 ladder, so
       results /search did find must not be hidden behind the amber notice. */
    server.use(answersHandler(fallbackNoResultsFixture));
    renderAt("/?q=wine+pairing");
    await ask();
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(NO_RESULTS_WARNING);
    /* CHANGED with the action selector. This used to assert that /search's
       own grid still owned the page behind the notice — the two retrievals
       genuinely diverge, so a zero-result fallback could sit above results
       /search had found. Selecting "Ask the shelf" now vetoes /search
       entirely, which is the whole point of "only fire what was selected", so
       there is no second grid to fall back to and the notice stands alone.
       The trade is deliberate: fewer surprise round-trips, at the cost of a
       fallback no longer rescuing itself with a different retrieval. */
    expect(screen.queryByText("2 matches")).toBeNull();
    expect(screen.queryByText("Spinach & Cheddar Frittata")).toBeNull();
    expect(screen.queryByText("The shelf has nothing for that.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not run a live search behind a fallback at all", async () => {
    server.use(
      answersHandler(fallbackNoResultsFixture),
      http.post("/api/v1/search", () =>
        HttpResponse.json(
          {
            error: {
              code: "internal_error",
              message: "The pantry is unreachable.",
              details: {},
            },
          },
          { status: 500 },
        ),
      ),
    );
    /* The /search handler above is rigged to fail. It is never called: with
       Ask committed the query is vetoed, so its error cannot surface. This
       replaces "a zero-result fallback does not swallow a live search error",
       which pinned the opposite — that the search error DID surface — back
       when both retrievals ran together. */
    renderAt("/?q=wine+pairing");
    await runAiAction(userEvent.setup(), "Ask the shelf");
    await screen.findByRole("status");
    expect(screen.queryByText("The pantry is unreachable.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("switching back to Search brings the live grid back and retires the notice", async () => {
    /* Was "a mode toggle brings the grid back", which worked because a chip
       committed a new URL on click. Nothing commits on selection now, so the
       thing that retires a fallback is choosing Search and submitting. */
    server.use(answersHandler(fallbackWithResultsFixture));
    renderAt("/?q=wine+pairing");
    const user = await ask();
    await screen.findByRole("status");
    await chooseMode(user, "Vector only");
    await chooseAction(user, "Search");
    await user.click(submitButton());
    /* Live search grid returns (search-grid heading, not the fallback one). */
    await waitFor(() =>
      expect(screen.getByText("2 matches")).toBeInTheDocument(),
    );
    /* The submit changes the ask — {q, mode, corpus} is the cache key — so the
       observer lands on an entry nobody has asked for. The notice goes with
       the answer it belonged to. Not a second round-trip: the fallback stays
       in the cache, one Back away. */
    expect(screen.queryByRole("status")).toBeNull();
    expect(actionTrigger()).toBeInTheDocument();
    expect(answersCalls).toBe(1);
  });

  it("'Try rephrasing' focuses and selects the search input", async () => {
    server.use(answersHandler(fallbackNoResultsFixture));
    renderAt("/?q=wine+pairing");
    const user = await ask();
    await screen.findByRole("status");
    await user.click(screen.getByRole("button", { name: /try rephrasing/i }));
    const input = screen.getByRole("textbox", {
      name: "What are we cooking?",
    }) as HTMLInputElement;
    expect(input).toHaveFocus();
    expect(input.selectionEnd).toBeGreaterThan(0);
    expect(input.selectionStart).toBe(0);
  });

  it("a real ApiError renders the alert with a retry that recovers", async () => {
    server.use(
      http.post(
        "/api/v1/answers",
        () =>
          HttpResponse.json(
            {
              error: {
                code: "internal_error",
                message: "The stove hiccuped.",
                details: {},
              },
            },
            { status: 500 },
          ),
        { once: true },
      ),
      answersHandler(groundedAnswerFixture),
    );
    renderAt("/?q=breakfast");
    const user = await ask();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The stove hiccuped.");
    expect(screen.queryByRole("status")).toBeNull();
    await user.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(
      await screen.findByText(/Grounded in your books · 3 citations/),
    ).toBeInTheDocument();
    expect(answersCalls).toBe(2);
  });
});
