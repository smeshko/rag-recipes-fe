import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";
import { answersHandler, groundedAnswerFixture } from "../msw/answers";
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

let answersCalls = 0;

/* sessionStorage outlives each jsdom render — scrub it so no test inherits
   another test's armed ask. */
beforeEach(() => {
  sessionStorage.clear();
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

const searchBox = () =>
  screen.getByRole("textbox", { name: "What are we cooking?" });
const askButton = () => screen.getByRole("button", { name: "Ask the shelf" });
const answerCard = () => screen.queryByText(/Grounded in your books/);

async function settleGrid() {
  await waitFor(() =>
    expect(screen.getByText(/matches|nothing for that/i)).toBeInTheDocument(),
  );
}

/** Search, then Ask, then open the first result — the flow that used to lose
    the answer. Leaves the router on the recipe page. */
async function askThenOpenRecipe(user: ReturnType<typeof userEvent.setup>) {
  await settleGrid();
  await user.click(askButton());
  await screen.findByText(/Grounded in your books/);
  expect(answersCalls).toBe(1);

  await user.click(screen.getByText("Spinach & Cheddar Frittata"));
  await screen.findByRole("link", { name: /Back to results/ });
  /* The search page is gone, not hidden — this is what used to destroy the
     answer, and the reason it has to live in the cache. */
  expect(answerCard()).toBeNull();
}

describe("an answer survives a detour through a recipe", () => {
  it("comes back on browser Back — with no second /answers", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    const router = renderAt("/?q=breakfast");
    await askThenOpenRecipe(user);

    await act(async () => {
      await router.navigate(-1);
    });

    expect(await screen.findByText(/Grounded in your books/)).toBeVisible();
    /* Restored from the cache, not re-asked: an LLM round-trip must never be
       the price of a navigation. */
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(answersCalls).toBe(1);
    /* And the slot is genuinely occupied — no "ask me" strip over an answer. */
    expect(screen.queryByTestId("answer-cta")).toBeNull();
    expect(screen.getByTestId("answer-status")).toHaveTextContent(
      "The answer is ready.",
    );
  });

  it("comes back through the recipe's own crumb link", async () => {
    /* The back link replays the URL captured in `?from=` rather than stepping
       a history entry, so it is a second, independent way back in. */
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    renderAt("/?q=breakfast");
    await askThenOpenRecipe(user);

    await user.click(screen.getByRole("link", { name: /Back to results/ }));

    expect(await screen.findByText(/Grounded in your books/)).toBeVisible();
    expect(searchBox()).toHaveValue("breakfast");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(answersCalls).toBe(1);
  });

  it("comes back after a detour taken from the answer's own picks", async () => {
    /* The reported route in: the recipe was opened from the answer card, not
       from the grid. */
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    const router = renderAt("/?q=breakfast");
    await settleGrid();
    await user.click(askButton());
    const card = (await screen.findByText(/Grounded in your books/)).closest(
      "section",
    ) as HTMLElement;

    await user.click(within(card).getAllByRole("link")[0] as HTMLElement);
    await screen.findByRole("link", { name: /Back to results/ });
    await act(async () => {
      await router.navigate(-1);
    });

    expect(await screen.findByText(/Grounded in your books/)).toBeVisible();
    expect(answersCalls).toBe(1);
  });

  it("does not resurrect for a different query typed after the return", async () => {
    /* Restoring must not become "the answer follows you around": the answer
       belongs to the query it was asked about and nothing else. */
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    const router = renderAt("/?q=breakfast");
    await askThenOpenRecipe(user);
    await act(async () => {
      await router.navigate(-1);
    });
    await screen.findByText(/Grounded in your books/);

    await user.clear(searchBox());
    await user.type(searchBox(), "scones{Enter}");
    await settleGrid();

    expect(answerCard()).toBeNull();
    expect(screen.getByTestId("answer-status")).toHaveTextContent("");
    /* The CTA is back, because the new query has no answer of its own. */
    expect(screen.getByTestId("ai-answers")).toBeInTheDocument();
    expect(answersCalls).toBe(1);
  });

  it("stays gone when the detour follows a query change, not an ask", async () => {
    /* No ask at all: opening a recipe and coming back must not conjure an
       answer out of a stale record. */
    const user = userEvent.setup();
    const router = renderAt("/?q=breakfast");
    await settleGrid();
    await user.click(screen.getByText("Spinach & Cheddar Frittata"));
    await screen.findByRole("link", { name: /Back to results/ });
    await act(async () => {
      await router.navigate(-1);
    });
    await settleGrid();

    expect(answerCard()).toBeNull();
    expect(answersCalls).toBe(0);
  });
});

describe("asked=1 is the ask", () => {
  it("Back across the ask empties the slot; Forward restores it from cache", async () => {
    /* The ask lives per history entry, so Back/Forward over the click that
       bought the answer is a real navigation, not a state glitch. */
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    const router = renderAt("/?q=breakfast");
    await settleGrid();
    await user.click(askButton());
    await screen.findByText(/Grounded in your books/);
    expect(router.state.location.search).toBe("?q=breakfast&asked=1");
    expect(answersCalls).toBe(1);

    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() =>
      expect(router.state.location.search).toBe("?q=breakfast"),
    );
    await settleGrid();
    /* The entry before the click never had an answer on it. */
    expect(answerCard()).toBeNull();
    expect(screen.getByTestId("ai-answers")).toBeInTheDocument();

    await act(async () => {
      await router.navigate(1);
    });
    await waitFor(() =>
      expect(router.state.location.search).toBe("?q=breakfast&asked=1"),
    );
    expect(await screen.findByText(/Grounded in your books/)).toBeVisible();
    /* Read back from the cache — a history step must never spend an LLM
       round-trip. */
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(answersCalls).toBe(1);
  });

  it("a repeat Ask on the same question adds no history entry", async () => {
    /* The answer landing re-enables the button, so a second Ask is one click
       away — and it commits an identical URL. Pushed as its own entry it
       would cost the user a Back press that visibly does nothing, which is
       the opposite of "Back across the ask empties the slot" above
       (review #1.1). */
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    const router = renderAt("/?q=breakfast");
    await settleGrid();
    await user.click(askButton());
    await screen.findByText(/Grounded in your books/);
    expect(router.state.location.search).toBe("?q=breakfast&asked=1");

    await user.click(askButton());
    await waitFor(() => expect(askButton()).toBeEnabled());
    expect(router.state.location.search).toBe("?q=breakfast&asked=1");

    /* One Back, not two, and the pre-Ask entry is the one it lands on. */
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() =>
      expect(router.state.location.search).toBe("?q=breakfast"),
    );
  });

  it("a repeat Ask on a noncanonically-spelled URL adds no history entry", async () => {
    /* Same question, different spelling (review #2.1): a hand-typed or
       bookmarked param order differs byte-wise from what writeParams emits,
       and comparing bytes would push it as a fresh entry that Back cannot
       tell apart from the one below it. The URL normalises — in place. */
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    const router = renderAt("/");
    await act(async () => {
      await router.navigate("/?mode=vector&q=breakfast&asked=1");
    });
    await settleGrid();
    await user.click(askButton());
    await screen.findByText(/Grounded in your books/);
    expect(router.state.location.search).toBe(
      "?q=breakfast&mode=vector&asked=1",
    );

    await act(async () => {
      await router.navigate(-1);
    });
    /* One Back reaches the entry underneath — the bare / — rather than the
       same search wearing a different spelling. */
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("a cold load of ?asked=1 shows no answer and fires no /answers", async () => {
    /* No answers handler registered: the unhandled-request guard is the second
       backstop behind the spy. The cache does not survive a reload either, and
       re-asking behind the user's back would spend a round-trip nobody bought.
       `asked=1` addresses a cache entry; it does not authorise a fetch. */
    renderAt("/?q=breakfast&asked=1");
    await settleGrid();
    expect(answerCard()).toBeNull();
    expect(screen.getByTestId("ai-answers")).toBeInTheDocument();
    expect(answersCalls).toBe(0);
  });

  it("a mode chip after an ask drops asked and empties the slot", async () => {
    /* A chip is a different question — {q, mode, corpus} is the ask — so the
       URL stops claiming an answer belongs here (PLAN.md D9). */
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    const router = renderAt("/?q=breakfast");
    await settleGrid();
    await user.click(askButton());
    await screen.findByText(/Grounded in your books/);

    await user.click(screen.getByRole("button", { name: "Vector only" }));
    await waitFor(() =>
      expect(router.state.location.search).toBe("?q=breakfast&mode=vector"),
    );
    await settleGrid();
    expect(answerCard()).toBeNull();
    expect(screen.getByTestId("answer-status")).toHaveTextContent("");
    expect(screen.getByTestId("ai-answers")).toBeInTheDocument();
    expect(answersCalls).toBe(1);
  });
});
