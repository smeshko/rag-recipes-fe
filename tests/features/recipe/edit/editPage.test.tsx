import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../../../src/routes";
import { needsReviewItemFixture } from "../../../msw/knowledgeItems";
import { server } from "../../../msw/server";

/* The edit page's states ladder (5.3 TASK-001). Every case renders through
   the real route table with createMemoryRouter — the idiom tests/recipe/* uses
   — because `/recipes/:id/edit` has to actually match, and because the form's
   later `useBlocker` needs a data router. */

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
  return { ...utils, router, queryClient };
}

/** The same item, as another tab's approval would leave it in the cache.
    `indexing`, not `ready`: approve flips to the transitional status and a
    worker settles it afterwards — and since shelved recipes became editable,
    `ready` is no longer a status the form has to defend itself against. */
const decidedInCache = {
  ...needsReviewItemFixture,
  knowledge_item: {
    ...needsReviewItemFixture.knowledge_item,
    status: "indexing",
  },
};

describe("edit page ladder", () => {
  it("renders the form host for a needs_review item, narrow and unfooted", async () => {
    const { container, router } = renderAt("/recipes/item_review/edit");

    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /repair this extraction/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("Editing")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/recipes/item_review/edit");
    /* The catch-all did not swallow the path, and the handle resolved narrow. */
    expect(screen.queryByTestId("notfound-page")).not.toBeInTheDocument();
    const shell = container.querySelector("div.mx-auto");
    expect(shell?.className).toContain("max-w-[880px]");
    expect(
      screen.queryByText(/grounded in your own books/),
    ).not.toBeInTheDocument();
  });

  it("shows the skeleton while the item is loading", async () => {
    server.use(
      http.get("/api/v1/knowledge-items/item_review", async () => {
        await delay(150);
        return HttpResponse.json({});
      }),
    );
    renderAt("/recipes/item_review/edit");

    expect(screen.getByTestId("edit-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-page")).not.toBeInTheDocument();
  });

  it("opens the form for a shelved item and warns that saving re-indexes it", async () => {
    /* The inverse of what this case used to assert. A `ready` item was refused
       until the backend grew a delete-and-re-embed path; now it edits like any
       other, at the cost of a trip through `indexing`. */
    renderAt("/recipes/item_full/edit");

    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByTestId("edit-reindex-notice")).toHaveTextContent(
      /drop out of search until that finishes/i,
    );
    /* No conflict banner: `ready` is an ordinary thing to be editing now, so
       the status gate and the conflict surface must agree it is fine. */
    expect(
      screen.queryByText(/no longer waiting for review/i),
    ).not.toBeInTheDocument();
    /* Nothing left to approve — the review verb only accepts needs_review. */
    expect(screen.queryByTestId("edit-save-approve")).not.toBeInTheDocument();
    expect(screen.getByTestId("edit-save")).toBeInTheDocument();
  });

  it("keeps Save & approve for a needs_review item, and no re-index notice", async () => {
    renderAt("/recipes/item_review/edit");

    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();
    expect(screen.getByTestId("edit-save-approve")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-reindex-notice")).not.toBeInTheDocument();
  });

  it("refuses a superseded item with the generic copy, echoing the status", async () => {
    renderAt("/recipes/item_superseded/edit");

    expect(
      await screen.findByText("This one can't be edited."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/only shelved recipes and items awaiting review/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Superseded")).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-page")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view the recipe/i }),
    ).toHaveAttribute("href", "/recipes/item_superseded");
  });

  it("renders the calm not-found state for a missing item", async () => {
    /* Also the hook-order proof (D22): the ladder's early returns sit above
       RecipeEditForm, not above a hook call, so a rung that never reaches the
       form must not warn about a changed hook count. */
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    renderAt("/recipes/item_ghost/edit");

    expect(
      await screen.findByRole("heading", {
        name: "That page isn't on the shelf.",
      }),
    ).toBeInTheDocument();
    expect(document.querySelector(".bg-danger-fill")).toBeNull();
    expect(
      consoleError.mock.calls.some((call) => /hook/i.test(String(call[0]))),
    ).toBe(false);
    consoleError.mockRestore();
  });

  it("renders the danger error state and recovers on retry", async () => {
    server.use(
      http.get(
        "/api/v1/knowledge-items/item_review",
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
    );
    const user = userEvent.setup();
    renderAt("/recipes/item_review/edit");

    expect(await screen.findByText("The stove hiccuped.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();
  });

  it("renders the not-a-recipe state for a non-recipe schema", async () => {
    /* Shape before status (D2): item_technique is `ready`, so both gates would
       fire — the wrong-shape one is the more informative dead end. */
    renderAt("/recipes/item_technique/edit");

    expect(
      await screen.findByRole("heading", { name: /isn't a recipe/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-page")).not.toBeInTheDocument();
    expect(
      screen.queryByText("This one can't be edited."),
    ).not.toBeInTheDocument();
  });

  it("keeps a dirty form when the item is decided under it", async () => {
    /* The status gate is re-evaluated on every cache update, and neither
       `useBlocker` nor `beforeunload` can see an unmount — so a background
       refetch that returns `ready` would otherwise swap the form for
       NotEditable and take the reviewer's unsaved work with it (review #1.2). */
    const user = userEvent.setup();
    const { queryClient } = renderAt("/recipes/item_review/edit");

    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), " (repaired)");

    act(() => {
      queryClient.setQueryData(
        ["knowledge-item", "item_review"],
        decidedInCache,
      );
    });

    /* The pill reading Indexing is the proof the fresh payload really reached
       the page — the form survived it rather than never being re-rendered. */
    expect(await screen.findByText("Indexing")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-edit-page")).toBeInTheDocument();
    expect(
      screen.queryByText("This one can't be edited."),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue(
      `${needsReviewItemFixture.knowledge_item.title} (repaired)`,
    );
  });

  it("keeps a dirty form when a background refetch fails", async () => {
    /* The same data-loss shape as the status flip, through the error rung:
       TanStack keeps the last good `data` alongside a failed refetch, so an
       errored query here means a blip — not that the item is gone. Tearing the
       form down for it would lose the draft in silence (review #2.1). */
    const user = userEvent.setup();
    const { queryClient } = renderAt("/recipes/item_review/edit");

    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), " (repaired)");

    server.use(
      http.get("/api/v1/knowledge-items/item_review", () =>
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
      ),
    );
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["knowledge-item", "item_review"],
      });
    });
    /* Nothing about a surviving form changes on error, so there is no positive
       signal to await — wait on the cache instead, then let React commit the
       observer's error notification before asserting. */
    await waitFor(() =>
      expect(
        queryClient.getQueryState(["knowledge-item", "item_review"])?.status,
      ).toBe("error"),
    );

    expect(screen.getByTestId("recipe-edit-page")).toBeInTheDocument();
    expect(screen.queryByText("The stove hiccuped.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue(
      `${needsReviewItemFixture.knowledge_item.title} (repaired)`,
    );
  });

  it("still yields to the dead end when the decided-under form is clean", async () => {
    /* Nothing to lose, so the honest answer wins: the item really is being
       indexed now. Only an open draft holds the form. */
    const { queryClient } = renderAt("/recipes/item_review/edit");

    expect(await screen.findByTestId("recipe-edit-page")).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData(
        ["knowledge-item", "item_review"],
        decidedInCache,
      );
    });

    expect(
      await screen.findByText("This one is being re-indexed."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-page")).not.toBeInTheDocument();
  });

  it("leaves the read page untouched at /recipes/:id", async () => {
    renderAt("/recipes/item_review");

    expect(await screen.findByTestId("recipe-page")).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-edit-page")).not.toBeInTheDocument();
  });
});
