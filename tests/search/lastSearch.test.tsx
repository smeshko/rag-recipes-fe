import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type { SearchMode } from "../../src/api/search";
import { LAST_SEARCH_KEY } from "../../src/features/search/lastSearch";
import {
  nextSearchParams,
  searchUrl,
} from "../../src/features/search/searchUrl";
import { routes } from "../../src/routes";
import { answersHandler, groundedAnswerFixture } from "../msw/answers";
import { searchFixture } from "../msw/handlers";
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

/** Capture every body POSTed to /api/v1/search. */
function captureSearchBodies() {
  const bodies: unknown[] = [];
  server.use(
    http.post("/api/v1/search", async ({ request }) => {
      const body = (await request.json()) as { query: string };
      bodies.push(body);
      return Response.json(searchFixture(body.query));
    }),
  );
  return bodies;
}

const searchBox = () =>
  screen.getByRole("textbox", { name: "What are we cooking?" });

const cookPill = () => screen.getByRole("link", { name: "Cook" });

/* The store holds the URL string verbatim now — no JSON hop to undo. */
const storedLastSearch = () => sessionStorage.getItem(LAST_SEARCH_KEY);

/* sessionStorage outlives each jsdom render — scrub it so no test inherits
   another test's "last search". */
beforeEach(() => sessionStorage.clear());

describe("nextSearchParams / searchUrl (the param rules, in one place)", () => {
  const commit = (
    prev: string,
    q: string,
    mode: SearchMode,
    asked = false,
  ): string =>
    searchUrl(nextSearchParams(new URLSearchParams(prev), { q, mode, asked }));

  it("keeps unknown params — they belong to somebody else", () => {
    expect(commit("review=included&future=param", "muffins", "hybrid")).toBe(
      "/?q=muffins&review=included&future=param",
    );
  });

  it("keeps hybrid out of the URL and deletes a mode that was there", () => {
    expect(commit("", "scones", "hybrid")).toBe("/?q=scones");
    expect(commit("q=scones&mode=vector", "scones", "hybrid")).toBe(
      "/?q=scones",
    );
    expect(commit("q=scones", "scones", "vector")).toBe(
      "/?q=scones&mode=vector",
    );
  });

  it("sets asked=1 on the write that arms the entry", () => {
    expect(commit("q=scones", "scones", "hybrid", true)).toBe(
      "/?q=scones&asked=1",
    );
  });

  it("drops asked when the question changed, keeps it when it did not", () => {
    /* A new q or a mode chip addresses a cache entry nobody asked for. */
    expect(commit("q=scones&asked=1", "muffins", "hybrid")).toBe("/?q=muffins");
    expect(commit("q=scones&asked=1", "scones", "vector")).toBe(
      "/?q=scones&mode=vector",
    );
    expect(commit("q=scones&asked=1", "scones", "hybrid")).toBe(
      "/?q=scones&asked=1",
    );
  });

  it("deletes an emptied q, and empty params are the bare /", () => {
    expect(commit("q=scones", "", "hybrid")).toBe("/");
    expect(searchUrl(new URLSearchParams())).toBe("/");
  });
});

describe("last-search persistence (storage writes)", () => {
  it("submitting a search stores the committed URL", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.type(searchBox(), "scones");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(storedLastSearch()).toBe("/?q=scones"));
  });

  it("stores a non-hybrid mode exactly as the URL carries it", async () => {
    const user = userEvent.setup();
    renderAt("/?q=frittata");
    await user.click(screen.getByRole("button", { name: "Vector only" }));
    await waitFor(() =>
      expect(storedLastSearch()).toBe("/?q=frittata&mode=vector"),
    );
  });

  it("a submit with the review filter armed stores review=included", async () => {
    const user = userEvent.setup();
    renderAt("/?review=included");
    await user.type(searchBox(), "muffins");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(storedLastSearch()).toBe("/?q=muffins&review=included"),
    );
  });

  it("survives an ask as ?…&asked=1", async () => {
    server.use(answersHandler(groundedAnswerFixture));
    const user = userEvent.setup();
    renderAt("/");
    await user.type(searchBox(), "scones");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(storedLastSearch()).toBe("/?q=scones&asked=1"));
  });

  it("committing an emptied query removes the key", async () => {
    const user = userEvent.setup();
    renderAt("/?q=frittata");
    await user.clear(searchBox());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(storedLastSearch()).toBeNull());
  });

  it("a mode-chip click on the bare / leaves the stored search alone", async () => {
    /* Back to the initial "/" entry (or the BackLink's "Back to Cook") lands
       here with a search still remembered; toggling a chip commits an empty
       q and must not wipe it (review #1.1). */
    sessionStorage.setItem(LAST_SEARCH_KEY, "/?q=frittata");
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "Keyword only" }));
    expect(storedLastSearch()).toBe("/?q=frittata");
    expect(cookPill()).toHaveAttribute("href", "/?q=frittata");
  });
});

describe("Cook pill restore", () => {
  it("carries the stored q from /library", async () => {
    sessionStorage.setItem(LAST_SEARCH_KEY, "/?q=frittata");
    renderAt("/library");
    expect(cookPill()).toHaveAttribute("href", "/?q=frittata");
  });

  it("carries a non-hybrid mode", async () => {
    sessionStorage.setItem(LAST_SEARCH_KEY, "/?q=frittata&mode=vector");
    renderAt("/library");
    expect(cookPill()).toHaveAttribute("href", "/?q=frittata&mode=vector");
  });

  it("carries review=included when the stored search was armed", async () => {
    sessionStorage.setItem(LAST_SEARCH_KEY, "/?q=frittata&review=included");
    renderAt("/library");
    expect(cookPill()).toHaveAttribute("href", "/?q=frittata&review=included");
  });

  it("is bare / when nothing is stored (fresh session)", async () => {
    renderAt("/library");
    expect(cookPill()).toHaveAttribute("href", "/");
  });

  /* The degrade contract (review #1.5): unreadable or nonsense storage must
     never break the nav — it falls back to the blank slate, silently. The key
     is writable from devtools and its value goes straight into an href, so an
     off-origin value is an open redirect, not merely a broken link. */
  it.each([
    ["corrupt JSON", "{not json"],
    ["an empty string", ""],
    ["an absolute URL", "https://evil.com"],
    ["a protocol-relative URL", "//evil.com"],
  ])("degrades to bare / on %s in storage", (_label, raw) => {
    sessionStorage.setItem(LAST_SEARCH_KEY, raw);
    renderAt("/library");
    expect(cookPill()).toHaveAttribute("href", "/");
  });
});

describe("return to Cook within staleTime", () => {
  it("Search → Library → Cook re-shows the results without a second /search", async () => {
    const bodies = captureSearchBodies();
    const user = userEvent.setup();
    renderAt("/");
    /* Commit through the box — only writeParams commits are remembered;
       a deep-loaded ?q= deliberately is not (restore rides the pill only). */
    await user.type(searchBox(), "frittata");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(bodies).toHaveLength(1));
    await screen.findByText("Spinach & Cheddar Frittata");

    await user.click(screen.getByRole("link", { name: "Library" }));
    await screen.findByText(/The shelf,/);

    /* The pill carries the remembered URL, so this click IS the restore. */
    await user.click(cookPill());
    await screen.findByText("Spinach & Cheddar Frittata");
    expect(searchBox()).toHaveValue("frittata");

    /* Fresh-within-staleTime: the remount must not buy a second request. */
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bodies).toHaveLength(1);
  });
});
