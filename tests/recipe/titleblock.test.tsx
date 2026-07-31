import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { statusTone } from "../../src/features/recipe/statusTone";
import { routes } from "../../src/routes";
import { fullItemFixture, sparseItemFixture } from "../msw/knowledgeItems";

function renderAt(path: string, state?: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, {
    initialEntries: [state === undefined ? path : { pathname: path, state }],
  });
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
    expect(await screen.findByText("onepantorulethemall")).toBeInTheDocument();
    expect(screen.getByText("page 22")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(
      screen.getByText(fullItemFixture.knowledge_item.summary as string),
    ).toBeInTheDocument();
    expect(screen.getByText("4–6 servings")).toBeInTheDocument();
    expect(screen.getByText("30 minutes")).toBeInTheDocument();
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

describe("crumb", () => {
  it("preserves q from location state", async () => {
    renderAt("/recipes/item_full", { q: "breakfast" });
    const crumb = await screen.findByRole("link", {
      name: /back to results/i,
    });
    expect(crumb.getAttribute("href")).toBe("/?q=breakfast");
  });

  it("reproduces a non-hybrid mode", async () => {
    renderAt("/recipes/item_full", { q: "breakfast", mode: "vector" });
    const crumb = await screen.findByRole("link", {
      name: /back to results/i,
    });
    expect(crumb.getAttribute("href")).toBe("/?q=breakfast&mode=vector");
  });

  it("omits the hybrid default mode", async () => {
    renderAt("/recipes/item_full", { q: "breakfast", mode: "hybrid" });
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
