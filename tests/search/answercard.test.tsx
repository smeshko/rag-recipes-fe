import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import {
  inlineCiteIds,
  parseAnswerText,
} from "../../src/features/search/answerText";
import { routes } from "../../src/routes";
import {
  answersHandler,
  groundedAnswerFixture,
  groundedParenFixture,
  groundedRepeatedCiteFixture,
} from "../msw/answers";
import { server } from "../msw/server";
import { aiAnswersTrigger, runAiAction } from "./composer";

function renderAsked(fixture = groundedAnswerFixture) {
  server.use(answersHandler(fixture));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, {
    initialEntries: ["/?q=breakfast&mode=vector"],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

async function ask() {
  const user = userEvent.setup();
  await waitFor(() => expect(aiAnswersTrigger()).toBeEnabled());
  await runAiAction(user, "Ask the shelf");
}

describe("answer card", () => {
  it("renders eyebrow count, paragraphs, chips and picks from the fixture", async () => {
    renderAsked();
    await ask();
    expect(
      await screen.findByText(/Grounded in your books · 3 citations/),
    ).toBeInTheDocument();

    /* Markdown renders — no literal ** or "1. " in the DOM text. */
    const card = screen
      .getByText(/Grounded in your books/)
      .closest("section") as HTMLElement;
    expect(card.textContent).not.toContain("**");
    expect(card.textContent).not.toContain("[cite_");
    const bolded = within(card).getByText("Fruit-Stuffed French Toast", {
      selector: "strong",
    });
    expect(bolded).toBeInTheDocument();
    expect(card.querySelectorAll("ol > li").length).toBe(3);

    /* Inline chips consumed their brackets and carry ?from= the search URL.
       The visible text is the page label; the accessible name also states the
       destination, because the chip goes to the recipe, not to the page. */
    const chip = within(card).getByRole("link", {
      name: "pp. 33–35 — open recipe",
    });
    expect(chip).toHaveTextContent("pp. 33–35");
    expect(chip.getAttribute("href")).toBe(
      "/recipes/item_frenchtoast?from=%2F%3Fq%3Dbreakfast%26mode%3Dvector%26asked%3D1",
    );

    /* Picks sidebar. */
    const picks = within(card).getByText("Tonight's picks")
      .parentElement as HTMLElement;
    const pickLinks = within(picks).getAllByRole("link");
    expect(pickLinks).toHaveLength(3);
    expect(pickLinks[0]).toHaveTextContent("Fruit-Stuffed French Toast");
    expect(pickLinks[0]?.getAttribute("href")).toBe(
      "/recipes/item_frenchtoast?from=%2F%3Fq%3Dbreakfast%26mode%3Dvector%26asked%3D1",
    );
    expect(pickLinks[1]).toHaveTextContent(
      "Makes 12 — the memorable centerpiece.",
    );
  });

  it("carries ?from= the search URL on pick navigation", async () => {
    const router = renderAsked();
    await ask();
    const card = (await screen.findByText(/Grounded in your books/)).closest(
      "section",
    ) as HTMLElement;
    const pick = within(card).getAllByRole("link")[0] as HTMLElement;
    pick.click();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/recipes/item_frenchtoast"),
    );
    /* The captured URL carries `asked=1`, so following the back link restores
       the answer the pick was taken from — not just the grid under it. */
    expect(new URLSearchParams(router.state.location.search).get("from")).toBe(
      "/?q=breakfast&mode=vector&asked=1",
    );
  });

  it("renders parenthesised inline cites and the rest in the trailing row", async () => {
    renderAsked(groundedParenFixture);
    await ask();
    const card = (await screen.findByText(/Grounded in your books/)).closest(
      "section",
    ) as HTMLElement;
    /* (cite_1) consumed; cite_4/cite_8 appear only under Cited pages. */
    expect(card.textContent).not.toContain("(cite_");
    const trailing = within(card).getByText(/Cited pages/);
    expect(within(trailing).getByText("p. 28")).toBeInTheDocument();
    expect(within(trailing).getByText("pp. 32–33")).toBeInTheDocument();
    expect(within(trailing).queryByText("pp. 33–35")).toBeNull();
    /* Eyebrow still counts the full union. */
    expect(within(card).getByText(/3 citations/)).toBeInTheDocument();
  });

  it("counts the chips it renders when a page is cited twice", async () => {
    renderAsked(groundedRepeatedCiteFixture);
    await ask();
    const card = (await screen.findByText(/Grounded in your books/)).closest(
      "section",
    ) as HTMLElement;
    /* cite_1 twice inline + cite_4 and cite_8 in the trailing row = 4 chips,
       even though only 3 distinct sources are cited. */
    const chips = within(card)
      .getAllByRole("link")
      .filter((el) => el.getAttribute("aria-label")?.includes("open recipe"));
    expect(chips).toHaveLength(4);
    expect(within(card).getByText(/4 citations/)).toBeInTheDocument();
  });
});

describe("answer text parser", () => {
  it("consumes enclosing brackets and parens around cite tokens", () => {
    const blocks = parseAnswerText("Try this. [cite_1]\n\nOr that (cite_2).");
    const flat = blocks.flatMap((b) => b.segments);
    expect(flat.filter((s) => s.kind === "cite")).toHaveLength(2);
    const texts = flat
      .filter((s) => s.kind === "text")
      .map((s) => (s as { value: string }).value)
      .join("");
    expect(texts).not.toMatch(/[[\]()]/);
  });

  it("marks numbered paragraphs as list items and bolds", () => {
    const blocks = parseAnswerText("Intro:\n\n1. **A** first\n\n2. B second");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "li", "li"]);
    expect(blocks[1]?.segments[0]).toEqual({ kind: "bold", value: "A" });
  });

  it("drops the markers of an unclosed bold rather than printing them", () => {
    /* A model answer truncated mid-bold. */
    const blocks = parseAnswerText("Try the **Fruit-Stuffed French Toast");
    const text = blocks
      .flatMap((b) => b.segments)
      .map((s) => (s.kind === "cite" ? "" : s.value))
      .join("");
    expect(text).toBe("Try the Fruit-Stuffed French Toast");
    expect(text).not.toContain("**");
  });

  it("still bolds when the pair is balanced", () => {
    const blocks = parseAnswerText("Try the **French Toast** tonight.");
    expect(blocks[0]?.segments).toEqual([
      { kind: "text", value: "Try the " },
      { kind: "bold", value: "French Toast" },
      { kind: "text", value: " tonight." },
    ]);
  });

  it("substitutes a bare cite_N with no delimiters", () => {
    const blocks = parseAnswerText("Use the frittata cite_3 for a crowd.");
    const flat = blocks.flatMap((b) => b.segments);
    expect(flat.filter((s) => s.kind === "cite")).toEqual([
      { kind: "cite", id: "cite_3" },
    ]);
    const text = flat
      .filter((s) => s.kind === "text")
      .map((s) => (s as { value: string }).value)
      .join("");
    expect(text).not.toContain("cite_3");
    expect(text).toBe("Use the frittata for a crowd.");
  });

  it("dedupes repeated inline ids", () => {
    expect(inlineCiteIds("a [cite_1] b [cite_1] c [cite_2]")).toEqual([
      "cite_1",
      "cite_2",
    ]);
  });
});
