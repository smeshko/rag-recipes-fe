import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { reviewItemsFixture, reviewScenario } from "../../../src/mocks/review";
import { routes } from "../../../src/routes";
import { server } from "../../msw/server";

function renderReview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: ["/review"] });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("review page states ladder", () => {
  it("resolves /review inside the narrow shell with no footer", async () => {
    server.use(...reviewScenario(reviewItemsFixture));
    const { container } = renderReview();

    expect(
      await screen.findByRole("heading", { name: /second look/i }),
    ).toBeInTheDocument();
    /* The catch-all no longer swallows the path. */
    expect(screen.queryByTestId("notfound-page")).not.toBeInTheDocument();
    /* Narrow Shell width, like /library — and no footer. */
    const shell = container.querySelector("div.mx-auto");
    expect(shell?.className).toContain("max-w-[880px]");
    expect(
      screen.queryByText(/grounded in your own books/),
    ).not.toBeInTheDocument();
  });

  it("shows the skeleton while pending, then the mocked items", async () => {
    server.use(
      http.get("/api/v1/review-items", async () => {
        await delay(150);
        return HttpResponse.json({ review_items: reviewItemsFixture });
      }),
    );
    renderReview();

    expect(await screen.findByTestId("review-skeleton")).toBeInTheDocument();
    /* statsLine discipline: em-dash placeholder until the list settles. */
    expect(
      screen.getByText(
        "— flagged during extraction · approve or reject to settle them",
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: "Maple Cutout Cookies" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("review-skeleton")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "5 flagged during extraction · approve or reject to settle them",
      ),
    ).toBeInTheDocument();
  });

  it("lists every mocked flagged item's title on success", async () => {
    server.use(...reviewScenario(reviewItemsFixture));
    renderReview();

    for (const item of reviewItemsFixture) {
      expect(
        await screen.findByRole("heading", { name: item.title, level: 3 }),
      ).toBeInTheDocument();
    }
  });

  it("shows the error box on 500 and refetches on Try again", async () => {
    const user = userEvent.setup();
    server.use(...reviewScenario(reviewItemsFixture));
    /* Prepended after the scenario, so it answers first — exactly once;
       the retry falls through to the healthy scenario handler. */
    server.use(
      http.get(
        "/api/v1/review-items",
        () =>
          HttpResponse.json(
            {
              error: {
                code: "internal_error",
                message: "The review queue could not be reached.",
                details: {},
              },
            },
            { status: 500 },
          ),
        { once: true },
      ),
    );
    renderReview();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The review queue could not be reached.");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Maple Cutout Cookies" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the nothing-anywhere empty state on an empty list", async () => {
    server.use(...reviewScenario([]));
    renderReview();

    expect(
      await screen.findByText("Nothing waiting for review."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Flagged extractions will land here when a book needs a human eye.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "0 flagged during extraction · approve or reject to settle them",
      ),
    ).toBeInTheDocument();
  });
});
