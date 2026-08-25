import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../../src/routes";
import { favouritesFixture, favouritesScenario } from "../../msw/favourites";
import { server } from "../../msw/server";

/* /favourites — the list, its states ladder, and the one verb it carries. */

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

function cardFor(title: string): HTMLElement {
  return screen.getByText(title).closest("article") as HTMLElement;
}

describe("favourites page", () => {
  it("lists saved recipes with their book, page span and when they were saved", async () => {
    server.use(...favouritesScenario(favouritesFixture));
    renderAt("/favourites");

    await screen.findByText("Maple Cutout Cookies");
    const card = within(cardFor("Maple Cutout Cookies"));
    expect(card.getByText(/bakingwithlesssugar/)).toBeInTheDocument();
    expect(card.getByText(/pp\. 41–43/)).toBeInTheDocument();
    expect(card.getByText(/saved /)).toBeInTheDocument();
    expect(
      card.getByText("Crisp maple-sweetened cutout cookies for decorating."),
    ).toBeInTheDocument();

    /* The count line is the page's own summary, not a per-card fact. */
    expect(screen.getByText(/^2 saved · /)).toBeInTheDocument();
  });

  it("carries /favourites as the return target on every recipe link", async () => {
    server.use(...favouritesScenario(favouritesFixture));
    renderAt("/favourites");
    await screen.findByText("Maple Cutout Cookies");

    const link = within(cardFor("Maple Cutout Cookies")).getByRole("link", {
      name: /View recipe/,
    });
    expect(link).toHaveAttribute(
      "href",
      "/recipes/ki_maple_cutouts?from=%2Ffavourites",
    );
  });

  it("says where the star is when nothing is saved yet", async () => {
    server.use(...favouritesScenario([]));
    renderAt("/favourites");

    expect(await screen.findByText("Nothing saved yet.")).toBeInTheDocument();
    expect(
      screen.getByText(/Star a recipe from a search result/),
    ).toBeInTheDocument();
    /* An empty list is a real answer, so the count line settles on 0. */
    expect(screen.getByText(/^0 saved · /)).toBeInTheDocument();
  });

  it("holds the count line at an em dash on an outage and retries", async () => {
    server.use(
      http.get("/api/v1/favourites", () =>
        HttpResponse.json(
          {
            error: {
              code: "internal_error",
              message: "Unexpected server error.",
              details: {},
            },
          },
          { status: 500 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderAt("/favourites");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unexpected server error.",
    );
    /* An outage is not "0 saved" — the placeholder holds until a real list
       lands, which is why the retry below has something to prove. */
    expect(screen.getByText(/^— saved · /)).toBeInTheDocument();

    server.use(...favouritesScenario(favouritesFixture));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Maple Cutout Cookies")).toBeInTheDocument();
    expect(screen.getByText(/^2 saved · /)).toBeInTheDocument();
  });

  it("removes a row the moment its star is cleared, before the request settles", async () => {
    const writes: string[] = [];
    server.use(
      ...favouritesScenario(favouritesFixture, {
        onWrite: (method, itemId) => writes.push(`${method} ${itemId}`),
      }),
    );
    const user = userEvent.setup();
    renderAt("/favourites");
    await screen.findByText("Maple Cutout Cookies");

    await user.click(
      within(cardFor("Maple Cutout Cookies")).getByRole("button", {
        name: /Remove Maple Cutout Cookies from favourites/,
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Maple Cutout Cookies"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Bean Stew")).toBeInTheDocument();
    expect(writes).toEqual(["DELETE ki_maple_cutouts"]);
  });

  it("puts a row back and says why when clearing its star fails", async () => {
    server.use(
      ...favouritesScenario(favouritesFixture, {
        writeFails: { status: 500, message: "Unexpected server error." },
      }),
    );
    const user = userEvent.setup();
    renderAt("/favourites");
    await screen.findByText("Maple Cutout Cookies");

    await user.click(
      within(cardFor("Maple Cutout Cookies")).getByRole("button", {
        name: /Remove Maple Cutout Cookies from favourites/,
      }),
    );

    /* The optimistic removal is rolled back, and the backend's own sentence
       is announced rather than a message the frontend invented. */
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unexpected server error.",
    );
    expect(screen.getByText("Maple Cutout Cookies")).toBeInTheDocument();
  });

  it("walks every page of the listing", async () => {
    const seen: string[] = [];
    const many = Array.from({ length: 201 }, (_, index) => ({
      ...favouritesFixture[0],
      id: `ki_${index}`,
      title: `Recipe ${index}`,
    }));
    server.use(
      http.get("/api/v1/favourites", ({ request }) => {
        const url = new URL(request.url);
        seen.push(url.searchParams.get("offset") as string);
        const offset = Number(url.searchParams.get("offset"));
        const limit = Number(url.searchParams.get("limit"));
        return HttpResponse.json({
          knowledge_items: many.slice(offset, offset + limit),
        });
      }),
    );
    renderAt("/favourites");

    expect(await screen.findByText("Recipe 200")).toBeInTheDocument();
    expect(seen).toEqual(["0", "200"]);
    expect(screen.getByText(/^201 saved · /)).toBeInTheDocument();
  });
});
