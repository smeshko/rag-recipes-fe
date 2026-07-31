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
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Ask" }));
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
    expect(
      screen.getByText(/2 matches · ranked by hybrid score/),
    ).toBeInTheDocument();
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

  it("mode toggle after a fallback brings the live grid back, notice stays", async () => {
    server.use(answersHandler(fallbackWithResultsFixture));
    renderAt("/?q=wine+pairing");
    const user = await ask();
    await screen.findByRole("status");
    await user.click(screen.getByRole("button", { name: "Vector only" }));
    /* Live search grid returns (search-grid heading, not the fallback one). */
    await waitFor(() =>
      expect(screen.getByText("2 matches")).toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
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
