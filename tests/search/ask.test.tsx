import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type { AnswerResponse } from "../../src/api";
import { routes } from "../../src/routes";
import {
  answersHandler,
  FALLBACK_WARNING,
  fallbackWithResultsFixture,
  groundedAnswerFixture,
} from "../msw/answers";
import { server } from "../msw/server";
import { actionTrigger, chooseAction, chooseMode, currentMode, runAiAction, submitButton } from "./composer";

/* An answer that takes long enough to observe mid-flight. The default
   handler resolves within a tick, so anything asserted after an awaited
   interaction would already see the settled state. */
const slowAnswersHandler = (fixture: AnswerResponse) =>
  http.post("/api/v1/answers", async () => {
    /* Deliberately does NOT record the call — a `request:start` listener in
       beforeEach already counts every /answers POST, and pushing here too
       would double-count each one. */
    await delay(300);
    return HttpResponse.json(fixture);
  });

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
/* The trigger, for enabled/disabled assertions. The two LLM actions now live
   behind it (ComposerControls), and it is what carries the empty-draft guard
   the old always-visible button carried. To RUN the ask, use runAiAction. */
const askButton = () => actionTrigger();
const clickAsk = (user: ReturnType<typeof userEvent.setup>) =>
  runAiAction(user, "Ask the shelf");

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
    await clickAsk(user);
    await waitFor(() => expect(answersCalls).toHaveLength(1));
    expect(answersCalls[0]?.body).toEqual({
      query: "breakfast",
      retrieval: { mode: "vector" },
      answer: { include_results: false },
    });
    /* Ask commits the arming param alongside the query: `asked=1` is what
       says an answer belongs on this history entry. */
    expect(router.state.location.search).toBe(
      "?q=breakfast&mode=vector&asked=1",
    );
  });

  it("Ask with edited input commits the new ?q= and asks about it", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    const router = renderAt("/?q=frittata");
    await settleGrid();
    await user.clear(searchBox());
    await user.type(searchBox(), "weekend brunch");
    await clickAsk(user);
    await waitFor(() => expect(answersCalls).toHaveLength(1));
    const firstBody = answersCalls[0]?.body as { query: string } | undefined;
    expect(firstBody?.query).toBe("weekend brunch");
    expect(router.state.location.search).toBe("?q=weekend+brunch&asked=1");
    /* The Ask-initiated q change must not self-clear the pending answer. */
    await waitFor(() =>
      expect(screen.queryByTestId("answer-skeleton")).toBeNull(),
    );
    expect(answersCalls).toHaveLength(1);
  });

  it("Ask is inert on a whitespace-only query", async () => {
    /* The old assertion was that the Ask BUTTON was disabled. There is no Ask
       button any more — the action is a setting, and a setting has nothing to
       disable. The guard moved into askShelf, so the thing to pin is that
       submitting a blank draft buys no round-trip. */
    const user = userEvent.setup();
    renderAt("/");
    await user.type(searchBox(), "   ");
    await chooseAction(user, "Ask the shelf");
    await user.click(submitButton());
    expect(answersCalls).toHaveLength(0);
  });

  it("changing the mode after an answer refires nothing", async () => {
    /* Stronger than the assertion it replaces. This used to be "a mode chip
       does not refire /answers", because a chip DID fire a fresh /search.
       Neither menu fires anything now, so the answer simply stays put and the
       new mode is what the next submit will use. */
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    renderAt("/?q=breakfast");
    await settleGrid();
    await clickAsk(user);
    await waitFor(() => expect(answersCalls).toHaveLength(1));

    await chooseMode(user, "Vector only");

    expect(currentMode()).toBe("Vector only");
    expect(answersCalls).toHaveLength(1);
    expect(screen.getByText(/Grounded in your books/)).toBeInTheDocument();
  });

  it("a new query via Enter clears the answer state", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    renderAt("/?q=breakfast");
    await settleGrid();
    await clickAsk(user);
    /* Pending skeleton appears while the LLM works. */
    await waitFor(() =>
      expect(screen.queryByTestId("answer-skeleton")).toBeNull(),
    );
    await user.clear(searchBox());
    await user.type(searchBox(), "scones");
    /* Back to a plain Search explicitly: the action is sticky, so Enter alone
       would ask again about the new query rather than search for it. That
       stickiness is the point of the selector — "we only fire what was
       selected" — so the test states the switch rather than assuming it. */
    await chooseAction(user, "Search");
    await user.click(submitButton());
    await settleGrid();
    /* Mutation reset: no answer artifacts and no new POST. */
    expect(screen.queryByTestId("answer-skeleton")).toBeNull();
    /* The card itself is gone, and the live region does not keep claiming an
       answer is ready for a query it was never asked about. */
    expect(screen.queryByText(/Grounded in your books/)).toBeNull();
    expect(screen.getByTestId("answer-status")).toHaveTextContent("");
    expect(answersCalls).toHaveLength(1);
  });

  it("refuses a second Ask while one is still in flight", async () => {
    server.use(slowAnswersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    renderAt("/?q=breakfast");
    await settleGrid();
    /* This used to dispatch two clicks inside ONE frame on an always-visible
       button — no re-render between them, so only a synchronous latch could
       stop the second. That vector no longer exists: the action lives in a
       menu that closes the moment it is chosen, so it cannot be fired twice in
       a frame at all. The guard that DOES still exist, and the one worth
       pinning, is that the action reports itself unavailable for as long as
       the round-trip is open. */
    await clickAsk(user);
    await user.click(actionTrigger());
    expect(
      await screen.findByRole("menuitemradio", { name: /^Ask the shelf/ }),
    ).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(answersCalls).toHaveLength(1);

    /* Waited on the ANSWER, not on the trigger: the trigger is disabled only
       by an empty draft, never by the flight, so asserting it is enabled here
       would pass instantly and prove nothing — and the second ask below would
       then land while the first was still open, be refused, and fail the
       count for the wrong reason. */
    await screen.findByText(/Grounded in your books/);
    expect(askButton()).toBeEnabled();

    /* The latch releases: a later Ask on a new query still works. */
    await user.clear(searchBox());
    await user.type(searchBox(), "scones");
    await clickAsk(user);
    await waitFor(() => expect(answersCalls).toHaveLength(2));
  });

  it("a q change mid-flight does not latch Ask off permanently", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    renderAt("/?q=breakfast");
    await settleGrid();
    await clickAsk(user);
    /* Reset the mutation mid-flight by changing ?q= — this detaches the
       observer, so anything keyed to a per-mutate callback would stick. */
    await user.clear(searchBox());
    await user.type(searchBox(), "scones");
    await chooseAction(user, "Search");
    await user.click(submitButton());
    await settleGrid();
    await clickAsk(user);
    await waitFor(() => expect(answersCalls).toHaveLength(2));
  });

  it("announces the answer lifecycle in a polite live region", async () => {
    /* Slow, so "Asking the shelf…" is still on screen once the awaited click
       returns — the default handler settles within a tick. */
    server.use(slowAnswersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
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

    await clickAsk(user);
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
    await clickAsk(user);
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
