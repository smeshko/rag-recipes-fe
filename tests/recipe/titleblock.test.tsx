import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";
import { statusTone } from "../../src/ui/statusTone";
import { fullItemFixture, sparseItemFixture } from "../msw/knowledgeItems";

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

describe("recipe title block", () => {
  it("renders pills, title, summary and facts from the full fixture", async () => {
    renderAt("/recipes/item_full");
    expect(
      await screen.findByRole("heading", {
        name: fullItemFixture.display.title,
      }),
    ).toBeInTheDocument();
    /* Book title appears in the pill and again in the provenance footer. */
    expect(
      (await screen.findAllByText("onepantorulethemall")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("page 22")).toBeInTheDocument();
    /* "Ready" is deliberately NOT rendered: it is the expected state of any
       recipe you can open, so the chip was a constant. The other statuses
       still show — see the states ladder. */
    expect(screen.queryByText("Ready")).toBeNull();
    expect(
      screen.getByText(fullItemFixture.knowledge_item.summary as string),
    ).toBeInTheDocument();
    expect(screen.getByText("4–6 servings")).toBeInTheDocument();
    expect(screen.getByText("30 minutes")).toBeInTheDocument();
    /* "4–6 servings" does not open with "Serves", so that fact keeps its
       label; a value like "Serves 2" would drop it (see FactsRow). */
    expect(screen.getByText("Serves")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("renders the warn pill for needs_review", async () => {
    renderAt("/recipes/item_review");
    expect(await screen.findByText("Needs review")).toBeInTheDocument();
  });

  it("renders no facts row and no summary for the sparse fixture", async () => {
    renderAt("/recipes/item_sparse");
    await screen.findByRole("heading", {
      name: sparseItemFixture.display.title,
    });
    expect(screen.queryByText("Serves")).toBeNull();
    expect(screen.queryByText("Total")).toBeNull();
  });

  it("renders no page pill for the zero-citation fixture", async () => {
    renderAt("/recipes/item_nocite");
    await screen.findByRole("heading", {
      name: fullItemFixture.display.title,
    });
    expect(screen.queryByText("page 22")).toBeNull();
  });
});

describe("back link", () => {
  it("preserves q from the return target", async () => {
    renderAt("/recipes/item_full?from=%2F%3Fq%3Dbreakfast");
    const crumb = await screen.findByRole("link", {
      name: /back to results/i,
    });
    expect(crumb.getAttribute("href")).toBe("/?q=breakfast");
  });

  it("reproduces a non-hybrid mode", async () => {
    renderAt("/recipes/item_full?from=%2F%3Fq%3Dbreakfast%26mode%3Dvector");
    const crumb = await screen.findByRole("link", {
      name: /back to results/i,
    });
    expect(crumb.getAttribute("href")).toBe("/?q=breakfast&mode=vector");
  });

  it("omits the hybrid default mode — the target never carried it", async () => {
    renderAt("/recipes/item_full?from=%2F%3Fq%3Dbreakfast");
    const crumb = await screen.findByRole("link", {
      name: /back to results/i,
    });
    expect(crumb.getAttribute("href")).toBe("/?q=breakfast");
  });

  it("degrades to Back to Cook on direct load", async () => {
    renderAt("/recipes/item_full");
    const crumb = await screen.findByRole("link", { name: /back to cook/i });
    expect(crumb.getAttribute("href")).toBe("/");
  });
});

describe("statusTone", () => {
  it("is total over backend statuses with an honest fallback", () => {
    expect(statusTone("ready")).toEqual({ tone: "ok", label: "Ready" });
    expect(statusTone("needs_review")).toEqual({
      tone: "warn",
      label: "Needs review",
    });
    expect(statusTone("superseded")).toEqual({
      tone: "neutral",
      label: "Superseded",
    });
    expect(statusTone("extracting")).toEqual({
      tone: "working",
      label: "Extracting",
    });
    expect(statusTone("mystery_state")).toEqual({
      tone: "neutral",
      label: "mystery_state",
    });
  });
});
