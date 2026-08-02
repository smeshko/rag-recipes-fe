import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { reviewItemsFixture, reviewScenario } from "../src/mocks/review";
import { routes } from "../src/routes";
import { answersHandler, groundedAnswerFixture } from "./msw/answers";
import { libraryShelfHandlers, shelfKeyedReviewItems } from "./msw/handlers";
import { fullItemFixture } from "./msw/knowledgeItems";
import { server } from "./msw/server";

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router };
}

describe("routing", () => {
  it("renders the search screen at /", () => {
    renderAt("/");
    expect(screen.getByTestId("search-page")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "What are we cooking?" }),
    ).toBeInTheDocument();
  });

  it("restores the query from ?q= into the search box", () => {
    renderAt("/?q=test");
    expect(
      screen.getByRole("textbox", { name: "What are we cooking?" }),
    ).toHaveValue("test");
  });

  it("renders the item title at /recipes/:id", async () => {
    renderAt("/recipes/item_full");
    expect(
      await screen.findByRole("heading", {
        name: "Spinach and Cheddar Frittata",
      }),
    ).toBeInTheDocument();
  });

  it("renders the library shelf at /library", async () => {
    server.use(...libraryShelfHandlers());
    renderAt("/library");
    expect(
      screen.getByRole("heading", { name: "On the shelf" }),
    ).toBeInTheDocument();
    /* Let the shelf queries settle inside the test. */
    expect(
      await screen.findByRole("heading", { name: "One Pan to Rule Them All" }),
    ).toBeInTheDocument();
  });

  /* The field is seeded from the URL, so history navigation must reseed it —
     otherwise the heading and the textbox disagree about what was searched. */
  it("restores the search field when the URL changes under it", async () => {
    const user = userEvent.setup();
    const { router } = renderAt("/");
    const field = () => screen.getByRole("textbox");

    await user.type(field(), "scones{Enter}");
    expect(field()).toHaveValue("scones");

    await user.clear(field());
    await user.type(field(), "frittata{Enter}");
    expect(field()).toHaveValue("frittata");

    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe("?q=scones");
    expect(field()).toHaveValue("scones");
  });

  /* Reseeding must not remount the field: a keyboard user refining a query
     would otherwise be dropped back to the document after every submit. */
  it("keeps focus in the search field after submitting", async () => {
    const user = userEvent.setup();
    renderAt("/");
    const field = () => screen.getByRole("textbox");

    await user.type(field(), "scones{Enter}");

    expect(field()).toHaveValue("scones");
    expect(field()).toHaveFocus();
  });

  it("renders the themed not-found on unknown paths", () => {
    renderAt("/nope");
    expect(screen.getByTestId("notfound-page")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to the kitchen/i }),
    ).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------- */
/* Return targets (?from=). Every case below is a REAL navigation    */
/* through the route table — clicked, not rendered at a crafted URL  */
/* — because the bug this phase kills lived in the gap between what  */
/* an entry point emitted and what the back link read.               */
/* ---------------------------------------------------------------- */

type User = ReturnType<typeof userEvent.setup>;

/** Serve every knowledge-item id from the one full fixture: an id the
    fixtures don't know renders RecipeNotFound, whose own "← Back to Cook"
    link would shadow the BackLink under test. */
const anyRecipeHandler = () =>
  http.get("/api/v1/knowledge-items/:itemId", ({ params }) =>
    HttpResponse.json({
      ...fullItemFixture,
      knowledge_item: {
        ...fullItemFixture.knowledge_item,
        id: String(params.itemId),
      },
    }),
  );

const backLink = () => screen.findByRole("link", { name: /^← Back to/ });

const url = (router: {
  state: { location: { pathname: string; search: string } };
}) => router.state.location.pathname + router.state.location.search;

const openReviewCard = async (user: User, title: string) => {
  const heading = await screen.findByRole("heading", { name: title });
  const card = heading.closest("article") as HTMLElement;
  await user.click(within(card).getByRole("link", { name: /view recipe/i }));
};

const askTheShelf = async (user: User) => {
  await user.click(await screen.findByRole("button", { name: "Ask" }));
  await screen.findByText(/Grounded in your books/);
};

interface EntryPoint {
  label: string;
  /** Where the walk starts — and, after the back link, where it must end. */
  from: string;
  backLabel: string;
  seed?: () => void;
  open: (user: User) => Promise<void>;
}

/** The four links that reach /recipes/:id directly. The library reaches one
    only THROUGH the queue, so it is the three-deep chain below, not a row. */
const ENTRY_POINTS: EntryPoint[] = [
  {
    label: "a search result card",
    from: "/?q=frittata&mode=vector",
    backLabel: "← Back to results · “frittata”",
    open: async (user) =>
      user.click(await screen.findByText("Spinach & Cheddar Frittata")),
  },
  {
    label: "an answer citation chip",
    from: "/?q=breakfast",
    backLabel: "← Back to results · “breakfast”",
    seed: () => server.use(answersHandler(groundedAnswerFixture)),
    open: async (user) => {
      await askTheShelf(user);
      await user.click(
        screen.getByRole("link", { name: "pp. 33–35 — open recipe" }),
      );
    },
  },
  {
    label: "an answer pick",
    from: "/?q=breakfast",
    backLabel: "← Back to results · “breakfast”",
    seed: () => server.use(answersHandler(groundedAnswerFixture)),
    open: async (user) => {
      await askTheShelf(user);
      await user.click(
        screen.getByRole("link", { name: /Fruit-Stuffed French Toast/ }),
      );
    },
  },
  {
    label: "a review card",
    from: "/review?document=doc_baking",
    backLabel: "← Back to review queue",
    seed: () => server.use(...reviewScenario(reviewItemsFixture)),
    open: (user) => openReviewCard(user, "Maple Cutout Cookies"),
  },
];

describe("return targets", () => {
  beforeEach(() => {
    /* sessionStorage outlives a jsdom render — no test may inherit another
       test's armed ask or remembered search. */
    sessionStorage.clear();
    server.use(anyRecipeHandler());
  });

  it.each(ENTRY_POINTS)(
    "returns to $from from a recipe opened via $label",
    async ({ from, backLabel, seed, open }) => {
      seed?.();
      const user = userEvent.setup();
      const { router } = renderAt(from);

      await open(user);
      await waitFor(() =>
        expect(router.state.location.pathname).toMatch(/^\/recipes\//),
      );

      const link = await backLink();
      expect(link).toHaveAccessibleName(backLabel);
      await user.click(link);

      await waitFor(() => expect(url(router)).toBe(from));
    },
  );

  /* The reported bug, verbatim: the reviewer used to land on `/` with
     "← Back to Cook" and lose the book they were working through. */
  it("puts the reviewer back on the queue they left, filter intact", async () => {
    server.use(...reviewScenario(reviewItemsFixture));
    const user = userEvent.setup();
    const { router } = renderAt("/review?document=doc_baking");

    await openReviewCard(user, "Maple Cutout Cookies");
    const link = await backLink();
    expect(link).toHaveAccessibleName("← Back to review queue");
    expect(link.getAttribute("href")).toBe("/review?document=doc_baking");

    await user.click(link);

    expect(url(router)).toBe("/review?document=doc_baking");
    /* Landed on the FILTERED queue, not the whole thing. */
    expect(
      await screen.findByRole("heading", { name: "Maple Cutout Cookies" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Stovetop Skillet Granola" }),
    ).not.toBeInTheDocument();
  });

  it("walks library → queue → recipe and back out again, one hop at a time", async () => {
    server.use(
      ...libraryShelfHandlers(),
      ...reviewScenario(shelfKeyedReviewItems),
    );
    const user = userEvent.setup();
    const { router } = renderAt("/library");

    const shelfRow = (
      await screen.findByRole("heading", { name: "Baking with Less Sugar" })
    ).closest("article") as HTMLElement;
    await user.click(
      within(shelfRow).getByRole("link", { name: /open review queue/i }),
    );

    const queueUrl = "/review?document=book-baking-less-sugar&from=%2Flibrary";
    await waitFor(() => expect(url(router)).toBe(queueUrl));
    expect(await backLink()).toHaveAccessibleName("← Back to your shelf");

    await openReviewCard(user, "Maple Cutout Cookies");
    /* The whole queue URL — its own `from` included — nested exactly once.
       A stack would show two hops here; this is one target carrying one. */
    await waitFor(() =>
      expect(url(router)).toBe(
        "/recipes/ki_maple_cutouts?from=%2Freview%3Fdocument%3Dbook-baking-less-sugar%26from%3D%252Flibrary",
      ),
    );

    const toQueue = await backLink();
    expect(toQueue).toHaveAccessibleName("← Back to review queue");
    await user.click(toQueue);
    await waitFor(() => expect(url(router)).toBe(queueUrl));
    /* Still the filtered queue, not the whole one. */
    expect(
      await screen.findByRole("heading", { name: "Maple Cutout Cookies" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Stovetop Skillet Granola" }),
    ).not.toBeInTheDocument();

    await user.click(await backLink());
    await waitFor(() => expect(url(router)).toBe("/library"));
  });
});

describe("the review queue's back link is guarded", () => {
  beforeEach(() => server.use(...reviewScenario(reviewItemsFixture)));

  it("names the shelf and returns to it when the queue was reached from there", async () => {
    const user = userEvent.setup();
    const { router } = renderAt("/review?from=%2Flibrary");

    const link = await backLink();
    expect(link).toHaveAccessibleName("← Back to your shelf");
    await user.click(link);

    expect(url(router)).toBe("/library");
  });

  /* Unlike /recipes/:id, the queue must NOT degrade to "← Back to Cook":
     a bookmarked or hand-typed /review would otherwise grow a prominent link
     dumping the reviewer on the search page (PLAN.md D6). */
  it.each([
    ["a bare /review", "/review"],
    ["an unroutable from", "/review?from=%2Fnope"],
  ])("shows no back link at all on %s", async (_label, path) => {
    renderAt(path);

    await screen.findByRole("heading", { name: "Maple Cutout Cookies" });
    expect(screen.queryByRole("link", { name: /Back to/ })).toBeNull();
  });
});

describe("a hostile ?from= is ignored", () => {
  it.each([
    ["an unroutable path", "%2Fnope"],
    ["a protocol-relative URL", "%2F%2Fevil.com"],
    ["an absolute URL", "https%3A%2F%2Fevil.com%2Fx"],
  ])("degrades to Cook for %s", async (_label, from) => {
    const { router } = renderAt(`/recipes/item_full?from=${from}`);

    const link = await backLink();
    expect(link).toHaveAccessibleName("← Back to Cook");
    expect(link.getAttribute("href")).toBe("/");
    /* And it really is the only back link on screen — the recipe rendered. */
    expect(router.state.location.pathname).toBe("/recipes/item_full");
  });
});
