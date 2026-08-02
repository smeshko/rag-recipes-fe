import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";

/* Cold: every case below is a first entry into the router with no prior
   navigation and therefore no location.state at all — the reload the old
   crumb could not survive (phase acceptance criterion 6). */
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

async function backLink() {
  return await screen.findByRole("link", { name: /^← Back to/ });
}

describe("BackLink", () => {
  it("names the review queue and keeps the target's own filter", async () => {
    renderAt("/recipes/item_full?from=%2Freview%3Fdocument%3Dd1");
    const link = await backLink();
    expect(link).toHaveAccessibleName("← Back to review queue");
    expect(link.getAttribute("href")).toBe("/review?document=d1");
  });

  it("names the shelf for a library target", async () => {
    renderAt("/recipes/item_full?from=%2Flibrary");
    const link = await backLink();
    expect(link).toHaveAccessibleName("← Back to your shelf");
    expect(link.getAttribute("href")).toBe("/library");
  });

  it("names the query for a search target, non-hybrid mode and all", async () => {
    renderAt("/recipes/item_full?from=%2F%3Fq%3Dbreakfast%26mode%3Dvector");
    const link = await backLink();
    expect(link).toHaveAccessibleName("← Back to results · “breakfast”");
    expect(link.getAttribute("href")).toBe("/?q=breakfast&mode=vector");
  });

  it("replays the search target verbatim — the hybrid default stays absent", async () => {
    renderAt("/recipes/item_full?from=%2F%3Fq%3Dbreakfast");
    const link = await backLink();
    expect(link.getAttribute("href")).toBe("/?q=breakfast");
    expect(link.getAttribute("href")).not.toContain("mode=");
  });

  it("degrades to Cook with no from at all", async () => {
    renderAt("/recipes/item_full");
    const link = await backLink();
    expect(link).toHaveAccessibleName("← Back to Cook");
    expect(link.getAttribute("href")).toBe("/");
  });

  it("degrades to Cook for a search target with no q", async () => {
    renderAt("/recipes/item_full?from=%2F");
    const link = await backLink();
    expect(link).toHaveAccessibleName("← Back to Cook");
    expect(link.getAttribute("href")).toBe("/");
  });

  it.each([
    ["an absolute URL", "https%3A%2F%2Fevil.com"],
    ["a protocol-relative URL", "%2F%2Fevil.com"],
    ["a backslash form", "%2F%5Cevil.com"],
    ["an unroutable path", "%2Fnope"],
    ["a javascript: URL", "javascript%3Aalert(1)"],
  ])("ignores %s and degrades to Cook", async (_label, from) => {
    renderAt(`/recipes/item_full?from=${from}`);
    const link = await backLink();
    expect(link).toHaveAccessibleName("← Back to Cook");
    expect(link.getAttribute("href")).toBe("/");
  });

  it("survives a cold load — no prior navigation, no location.state", async () => {
    const router = renderAt("/recipes/item_full?from=%2Freview");
    expect(router.state.location.state).toBeNull();
    const link = await backLink();
    expect(link).toHaveAccessibleName("← Back to review queue");
    expect(link.getAttribute("href")).toBe("/review");
  });
});
