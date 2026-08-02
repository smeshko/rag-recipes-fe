import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import type {
  KnowledgeItemResponse,
  KnowledgeItemUpdateRequest,
} from "../../src/api";
import {
  ApiError,
  documentDetailQueryOptions,
  request,
  route,
} from "../../src/api";
import { useDocument } from "../../src/api/documents";
import {
  useKnowledgeItem,
  useUpdateKnowledgeItem,
} from "../../src/api/knowledgeItems";
import {
  applyPatch,
  decidedItemFixture,
  editableItemsFixture,
  editScenario,
  emptyPatchEnvelope,
  ingestionAlreadyRunningEnvelope,
  knowledgeItemErrorHandler,
  knowledgeItemNotFoundEnvelope,
  knowledgeItemPatchHandler,
  reviewItemStaleEnvelope,
  reviewNotPendingEnvelope,
  SOFT_WARNING_MESSAGES,
  unauthorizedEnvelope,
  unauthorizedPatchHandler,
  validationFailedEnvelope,
} from "../../src/mocks/knowledgeItems";
import { fullItemFixture, sparseItemFixture } from "../msw/knowledgeItems";
import { server } from "../msw/server";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/* The zero-GET counter below subscribes to the server's lifecycle events;
   those survive `resetHandlers()`, so drop them between tests. */
afterEach(() => {
  server.events.removeAllListeners();
});

describe("useKnowledgeItem", () => {
  it("returns the full fixture typed", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useKnowledgeItem("item_full"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.knowledge_item.title).toBe(
      fullItemFixture.knowledge_item.title,
    );
    expect(
      result.current.data?.knowledge_item.structured_data.ingredients,
    ).toHaveLength(3);
  });

  it("surfaces knowledge_item_not_found for an unknown id", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useKnowledgeItem("item_missing"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("knowledge_item_not_found");
    expect(err.details).toEqual({ item_id: "item_missing" });
  });

  it("passes the sparse fixture through without guards failing", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useKnowledgeItem("item_sparse"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const sd = result.current.data?.knowledge_item.structured_data;
    expect(sd?.ingredients).toEqual([]);
    expect(sd?.total_time ?? null).toBeNull();
    expect(result.current.data?.knowledge_item.confidence).toBeNull();
    expect(result.current.data?.knowledge_item.summary).toBe(
      sparseItemFixture.knowledge_item.summary,
    );
  });

  it("fires no request for an undefined id", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useKnowledgeItem(undefined), {
      wrapper,
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isPending).toBe(true);
  });
});

describe("useDocument", () => {
  it("shares 2.1's ['document', id] cache entry", async () => {
    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(() => useDocument("doc_onepan"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = queryClient.getQueryData(
      documentDetailQueryOptions("doc_onepan").queryKey,
    );
    expect(cached).toBe(result.current.data);
    expect(result.current.data?.document.title).toBe("onepantorulethemall");
  });

  it("fires no request for an undefined id", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useDocument(undefined), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(result.current.fetchStatus).toBe("idle");
  });
});

/* The mocked edit wire (5.2 TASK-003). No hook exists yet — every call below
   goes through `request(route(…, "patch"))`, so this block exercises the
   generated PATCH route end-to-end rather than only at compile time.

   Both 404s in this file now assert the same `details` key, `{item_id}`:
   the 2.2 read fixture used to spell it differently, which was fixture-side
   drift rather than a wire difference. Closed in 5.4 against live probes of
   both the GET and the PATCH. */
describe("PATCH /knowledge-items/{item_id} (contract mock)", () => {
  const patch = (itemId: string, body: KnowledgeItemUpdateRequest) =>
    request<KnowledgeItemResponse>(
      route("/knowledge-items/{item_id}", "patch", {
        params: { item_id: itemId },
      }),
      {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      },
    );

  const get = (itemId: string) =>
    request<KnowledgeItemResponse>(
      route("/knowledge-items/{item_id}", "get", {
        params: { item_id: itemId },
      }),
    );

  const fixture = (id: string): KnowledgeItemResponse => {
    const found = editableItemsFixture.find(
      (item) => item.knowledge_item.id === id,
    );
    if (!found) {
      throw new Error(`No editable fixture '${id}'.`);
    }
    return found;
  };

  const rejection = async (promise: Promise<unknown>): Promise<ApiError> => {
    const err: unknown = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  };

  /* ---------- partial update ---------- */

  it("leaves every unnamed field byte-identical on a title-only patch", async () => {
    const before = fixture("item_edit_confidence").knowledge_item;
    const after = (
      await patch("item_edit_confidence", {
        title: "Honey Oat Loaf, corrected",
      })
    ).knowledge_item;

    expect(after.title).toBe("Honey Oat Loaf, corrected");
    expect(after.summary).toBe(before.summary);
    expect(after.structured_data.yield).toBe(before.structured_data.yield);
    expect(after.structured_data.prep_time).toBe(
      before.structured_data.prep_time,
    );
    expect(after.structured_data.cook_time).toBe(
      before.structured_data.cook_time,
    );
    expect(after.structured_data.total_time).toBe(
      before.structured_data.total_time,
    );
    expect(after.structured_data.ingredients).toEqual(
      before.structured_data.ingredients,
    );
    expect(after.structured_data.steps).toEqual(before.structured_data.steps);
    expect(after.structured_data.ingredients_text).toBe(
      before.structured_data.ingredients_text,
    );
  });

  it("clears summary on an explicit null while the title stays", async () => {
    const before = fixture("item_edit_confidence").knowledge_item;
    expect(before.summary).not.toBeNull();

    const after = (await patch("item_edit_confidence", { summary: null }))
      .knowledge_item;
    expect(after.summary).toBeNull();
    expect(after.title).toBe(before.title);
  });

  /* ---------- whole-array replacement ---------- */

  it("replaces both line lists wholesale and renumbers from list order", async () => {
    const sd = (
      await patch("item_edit_confidence", {
        ingredients: ["2 cups bread flour", "1 tsp fine sea salt"],
        steps: ["Mix everything.", "Bake for 40 minutes."],
      })
    ).knowledge_item.structured_data;

    expect(sd.ingredients?.map((i) => i.raw_text)).toEqual([
      "2 cups bread flour",
      "1 tsp fine sea salt",
    ]);
    expect(sd.ingredients?.map((i) => i.position)).toEqual([1, 2]);
    expect(sd.steps?.map((s) => s.text)).toEqual([
      "Mix everything.",
      "Bake for 40 minutes.",
    ]);
    expect(sd.steps?.map((s) => s.step_number)).toEqual([1, 2]);
    expect(sd.ingredients_text).toBe("2 cups bread flour\n1 tsp fine sea salt");
    expect(sd.steps_text).toBe("Mix everything.\nBake for 40 minutes.");
  });

  it("matches submitted lines back by text, so a reorder keeps each parse", async () => {
    const before = fixture("item_edit_confidence").knowledge_item;
    const original = before.structured_data.ingredients ?? [];
    const reordered = [
      "3 tbsp honey",
      "1 tsp fine sea salt",
      "2 cups bread flour",
      "1 tsp fine sea salt",
    ];

    const after = (
      await patch("item_edit_confidence", { ingredients: reordered })
    ).knowledge_item.structured_data.ingredients;

    expect(after?.map((i) => i.raw_text)).toEqual(reordered);
    expect(after?.map((i) => i.position)).toEqual([1, 2, 3, 4]);
    /* Parse and normalization survive the move — only the number changed. */
    expect(after?.[0]?.item_normalized).toBe("honey");
    expect(after?.[2]?.item_normalized).toBe("bread flour");
    expect(after?.[2]?.confidence).toEqual(original[0]?.confidence);
    /* The verbatim duplicate is consumed greedily left-to-right: the two
       identical lines bind the two identical old rows, not both the first. */
    expect(after?.[1]?.notes).toBe("for the dough");
    expect(after?.[3]?.notes).toBe("for the topping");
  });

  it("marks a new or rewritten line as human-authored", async () => {
    const after = (
      await patch("item_edit_confidence", {
        ingredients: ["3 tbsp honey", "1 cup rolled oats"],
        steps: ["Mix everything."],
      })
    ).knowledge_item.structured_data;

    const added = after.ingredients?.[1] as
      | { edited?: boolean; item_normalized?: string | null }
      | undefined;
    expect(added?.edited).toBe(true);
    expect(added?.item_normalized).toBeNull();
    expect(after.ingredients?.[1]?.confidence).toEqual({
      overall: 1,
      quantity: 1,
      unit: 1,
      item: 1,
      normalization: 1,
    });
    /* A human wrote the step — claiming page provenance would be a lie. */
    expect(after.steps?.[0]?.source_span_ids).toEqual([]);
  });

  /* ---------- flag recomputation ---------- */

  it("clears no_ingredients but keeps low_overall_confidence", async () => {
    const before = fixture("item_edit_noingredients").knowledge_item;
    expect(before.structured_data.warnings).toEqual([
      "no_ingredients",
      "low_overall_confidence",
    ]);

    const after = (
      await patch("item_edit_noingredients", {
        ingredients: ["1 cup maple syrup", "3 cups all-purpose flour"],
      })
    ).knowledge_item;

    expect(after.structured_data.warnings).toEqual(["low_overall_confidence"]);
    expect(after.review_reasons).toEqual([
      {
        code: "low_overall_confidence",
        message: SOFT_WARNING_MESSAGES.low_overall_confidence,
      },
    ]);
  });

  it("clears recipe_too_short once the rebuilt body clears the threshold", async () => {
    expect(
      fixture("item_edit_short").knowledge_item.structured_data.warnings,
    ).toEqual(["recipe_too_short"]);

    /* A title-only edit cannot move the length verdict — the body the rule
       measures is recomposed only when the LINE lists change. */
    const untouched = (
      await patch("item_edit_short", { title: "Skillet Cornbread, corrected" })
    ).knowledge_item;
    expect(untouched.structured_data.warnings).toEqual(["recipe_too_short"]);

    const after = (
      await patch("item_edit_short", {
        steps: [
          "Whisk the cornmeal, buttermilk and melted butter into a loose batter.",
          "Pour into the hot skillet and bake for 25 minutes, until the top is golden and springs back.",
        ],
      })
    ).knowledge_item;

    expect(after.structured_data.warnings).toEqual([]);
    expect(after.review_reasons).toEqual([]);
  });

  it("keeps every confidence-derived code, low_normalization_confidence included", async () => {
    const before = fixture("item_edit_confidence").knowledge_item;
    const codes = ["low_boundary_confidence", "low_normalization_confidence"];
    expect(before.structured_data.warnings).toEqual(codes);

    /* Every body here leaves a rebuilt body over MOCK_MIN_RECIPE_CHARS on
       purpose: recomputation is symmetric, so a short replacement would also
       RAISE recipe_too_short and stop this being a test about the
       confidence-derived codes. */
    for (const body of [
      { title: "Honey Oat Sandwich Loaf, corrected" },
      { ingredients: ["2 cups bread flour", "1 tsp fine sea salt"] },
      {
        steps: [
          "Mix the flour, salt and honey into the warm milk and knead.",
          "Bake for forty minutes and cool the loaf on a wire rack.",
        ],
      },
    ] satisfies KnowledgeItemUpdateRequest[]) {
      const after = (await patch("item_edit_confidence", body)).knowledge_item;
      expect(after.structured_data.warnings).toEqual(codes);
      expect(after.review_reasons.map((r) => r.code)).toEqual(codes);
    }
  });

  /* The remaining two rows of the contract's §2 table have no fixture of
     their own — the roster proves the branches an edit can reach, and these
     two are reached by a warning list rather than by content. Register a
     one-off item over the base handler so each row still has its own named
     test. */
  const withWarnings = (
    id: string,
    warnings: string[],
  ): KnowledgeItemResponse => {
    const item = structuredClone(fixture("item_edit_confidence"));
    item.knowledge_item.id = id;
    item.knowledge_item.structured_data.warnings = warnings;
    item.knowledge_item.review_reasons = warnings.map((code) => ({
      code,
      message: SOFT_WARNING_MESSAGES[code] as string,
    }));
    return item;
  };

  it("clears no_steps once the patch supplies a non-empty step list", async () => {
    const item = withWarnings("item_edit_nosteps", ["no_steps"]);
    const sd = item.knowledge_item.structured_data;
    sd.steps = [];
    sd.steps_text = "";
    /* Double the ingredient block so the step-less body still clears
       MOCK_MIN_RECIPE_CHARS. A fixture whose body is BOTH step-less and short
       is genuinely recipe_too_short as well — recomputation would raise it —
       and this test is about no_steps. */
    sd.ingredients = [...(sd.ingredients ?? []), ...(sd.ingredients ?? [])].map(
      (row, index) => ({ ...row, position: index + 1 }),
    );
    sd.ingredients_text = (sd.ingredients ?? [])
      .map((row) => row.raw_text)
      .join("\n");
    server.use(knowledgeItemPatchHandler([item]));

    const untouched = (
      await patch("item_edit_nosteps", { title: "Honey Oat Loaf, corrected" })
    ).knowledge_item;
    expect(untouched.structured_data.warnings).toEqual(["no_steps"]);

    const after = (
      await patch("item_edit_nosteps", {
        steps: ["Knead for ten minutes.", "Bake for forty minutes."],
      })
    ).knowledge_item;

    expect(after.structured_data.warnings).toEqual([]);
    expect(after.review_reasons).toEqual([]);
  });

  it("keeps recipe_too_long — a documented mock divergence, not the server's behaviour", async () => {
    server.use(
      knowledgeItemPatchHandler([
        withWarnings("item_edit_toolong", ["recipe_too_long"]),
      ]),
    );

    /* The server clears this once the rebuilt body drops back under the upper
       bound; the mock models no upper bound at all (PLAN D7, contract §2), so
       a shortened body — one still over the LOWER bound, which the mock does
       measure — keeps the code. 5.3 must not build clearing UI on it. */
    const after = (
      await patch("item_edit_toolong", {
        ingredients: ["2 cups bread flour", "1 tsp fine sea salt"],
        steps: [
          "Mix the flour and salt, then knead until the dough is smooth.",
          "Bake for forty minutes and cool on a rack.",
        ],
      })
    ).knowledge_item;

    expect(after.structured_data.warnings).toEqual(["recipe_too_long"]);
    expect(after.review_reasons).toEqual([
      {
        code: "recipe_too_long",
        message: SOFT_WARNING_MESSAGES.recipe_too_long,
      },
    ]);
  });

  /* ---------- states the server could never answer with ---------- */

  it("never reports a body as both too short and too long", async () => {
    server.use(
      knowledgeItemPatchHandler([
        withWarnings("item_edit_toolong", ["recipe_too_long"]),
      ]),
    );

    /* Cut the body under the lower bound: recipe_too_short is derived, and
       recipe_too_long — which the mock only ever carries forward — cannot
       survive next to it. */
    const after = (
      await patch("item_edit_toolong", {
        ingredients: ["2 cups bread flour"],
        steps: ["Mix."],
      })
    ).knowledge_item;

    expect(after.structured_data.warnings).toEqual(["recipe_too_short"]);
  });

  it("drops low_normalization_confidence once no ingredient line is left", async () => {
    /* `validate_soft` takes the MINIMUM normalization confidence across the
       list; an empty list has no line below the threshold. Narrower than D7's
       divergence, which is about a list that still HAS untrusted lines. */
    const after = (await patch("item_edit_confidence", { ingredients: [] }))
      .knowledge_item;

    expect(after.structured_data.warnings).not.toContain(
      "low_normalization_confidence",
    );
    expect(after.review_reasons.map((reason) => reason.code)).not.toContain(
      "low_normalization_confidence",
    );
  });

  /* ---------- flags an edit RAISES ---------- */

  /* The mirror of the three tests above: recomputation is symmetric over the
     codes the mock models, because emptying a list is a legal patch (contract
     §1, "send `[]` to empty it") and the server would answer it with the
     warning back on. A mock that could only drop codes would let 5.3 build a
     form whose destructive edits always look clean. */

  it("raises no_ingredients when the patch empties the ingredient list", async () => {
    const before = fixture("item_edit_confidence").knowledge_item;
    expect(before.structured_data.warnings).not.toContain("no_ingredients");

    const after = (await patch("item_edit_confidence", { ingredients: [] }))
      .knowledge_item;

    expect(after.structured_data.ingredients).toEqual([]);
    expect(after.structured_data.warnings).toContain("no_ingredients");
    expect(after.review_reasons).toContainEqual({
      code: "no_ingredients",
      message: SOFT_WARNING_MESSAGES.no_ingredients,
    });
    /* The confidence code it already carried is still there and still first.
       low_normalization_confidence is NOT — an empty list has no line below
       the threshold, so the server could not report it either. */
    expect(after.structured_data.warnings).toEqual([
      "low_boundary_confidence",
      "no_ingredients",
    ]);
  });

  it("raises no_steps when the patch empties the step list", async () => {
    const after = (await patch("item_edit_confidence", { steps: [] }))
      .knowledge_item;

    expect(after.structured_data.steps).toEqual([]);
    expect(after.structured_data.warnings).toContain("no_steps");
    expect(after.review_reasons).toContainEqual({
      code: "no_steps",
      message: SOFT_WARNING_MESSAGES.no_steps,
    });
  });

  it("raises recipe_too_short when the rebuilt body drops under the threshold", async () => {
    const before = fixture("item_edit_confidence").knowledge_item;
    expect(before.structured_data.warnings).not.toContain("recipe_too_short");

    const after = (
      await patch("item_edit_confidence", {
        ingredients: ["1 tsp salt"],
        steps: ["Mix."],
      })
    ).knowledge_item;

    expect(after.structured_data.warnings).toContain("recipe_too_short");
    expect(after.review_reasons).toContainEqual({
      code: "recipe_too_short",
      message: SOFT_WARNING_MESSAGES.recipe_too_short,
    });
  });

  it("raises nothing it does not model, however drastic the edit", async () => {
    /* The four preserve-only codes are never invented: no confidence verdict
       and no upper length bound can be derived from the fixtures. */
    const after = (
      await patch("item_edit_short", { ingredients: [], steps: [] })
    ).knowledge_item;

    expect(after.structured_data.warnings).toEqual([
      "recipe_too_short",
      "no_ingredients",
      "no_steps",
    ]);
  });

  /* ---------- edited_at ---------- */

  it("stamps edited_at and leaves the item needs_review", async () => {
    expect(fixture("item_edit_short").knowledge_item.edited_at).toBeNull();

    const after = (
      await patch("item_edit_short", { title: "Skillet Corn Bread" })
    ).knowledge_item;

    expect(after.edited_at).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(after.edited_at as string))).toBe(false);
    expect(after.status).toBe("needs_review");
  });

  /* ---------- statelessness of the base handler ---------- */

  /* The next two tests are a PAIR: the same fixture id patched through the
     BASE handler in consecutive tests. The second must still see the pristine
     fixture — applyPatch never mutates the shared array. */
  it("patches item_edit_noingredients through the base handler (first run)", async () => {
    const after = (
      await patch("item_edit_noingredients", {
        ingredients: ["1 cup maple syrup"],
      })
    ).knowledge_item;
    expect(after.structured_data.ingredients).toHaveLength(1);
    expect(after.structured_data.warnings).toEqual(["low_overall_confidence"]);
  });

  it("patches item_edit_noingredients again on a pristine fixture (no leak)", async () => {
    const after = (
      await patch("item_edit_noingredients", { title: "Maple Cutouts" })
    ).knowledge_item;
    expect(after.structured_data.ingredients).toEqual([]);
    expect(after.structured_data.warnings).toEqual([
      "no_ingredients",
      "low_overall_confidence",
    ]);
    expect(
      fixture("item_edit_noingredients").knowledge_item.edited_at,
    ).toBeNull();
  });

  /* ---------- statefulness of editScenario ---------- */

  it("persists a patch into a following GET and stacks a second patch", async () => {
    server.use(...editScenario(editableItemsFixture));

    await patch("item_edit_short", { title: "Skillet Cornbread, corrected" });
    const read = await get("item_edit_short");
    expect(read.knowledge_item.title).toBe("Skillet Cornbread, corrected");

    const second = (
      await patch("item_edit_short", { summary: "Corrected summary." })
    ).knowledge_item;
    expect(second.title).toBe("Skillet Cornbread, corrected");
    expect(second.summary).toBe("Corrected summary.");

    /* The scenario closed over its own copy — the shared fixture is intact. */
    expect(fixture("item_edit_short").knowledge_item.title).toBe(
      "Skillet Cornbread",
    );
  });

  /* ---------- the error table, row by row ---------- */

  it("answers 400 invalid_request for a body naming no editable field", async () => {
    const err = await rejection(patch("item_edit_short", {}));
    expect(err.code).toBe("invalid_request");
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ item_id: "item_edit_short" });
    expect(err.message).toBe("Request body names no editable field.");
  });

  it("answers 404 knowledge_item_not_found for an unknown id", async () => {
    const err = await rejection(patch("item_edit_nowhere", { title: "x" }));
    expect(err.code).toBe("knowledge_item_not_found");
    expect(err.status).toBe(404);
    expect(err.details).toEqual({ item_id: "item_edit_nowhere" });
  });

  it("answers 404 review_not_pending for an item that is not awaiting review", async () => {
    server.use(knowledgeItemPatchHandler([decidedItemFixture]));
    const err = await rejection(
      patch(decidedItemFixture.knowledge_item.id, { title: "x" }),
    );
    expect(err.code).toBe("review_not_pending");
    expect(err.status).toBe(404);
    expect(err.details).toEqual({
      item_id: decidedItemFixture.knowledge_item.id,
      status: "ready",
    });
  });

  it("surfaces 409 ingestion_already_running", async () => {
    server.use(
      knowledgeItemErrorHandler(
        409,
        ingestionAlreadyRunningEnvelope("doc_baking", "extracting_items"),
      ),
    );
    const err = await rejection(patch("item_edit_short", { title: "x" }));
    expect(err.code).toBe("ingestion_already_running");
    expect(err.status).toBe(409);
    expect(err.details).toEqual({
      document_id: "doc_baking",
      status: "extracting_items",
    });
  });

  it("surfaces 409 review_item_stale", async () => {
    server.use(
      knowledgeItemErrorHandler(
        409,
        reviewItemStaleEnvelope("item_edit_short", 1, 2),
      ),
    );
    const err = await rejection(patch("item_edit_short", { title: "x" }));
    expect(err.code).toBe("review_item_stale");
    expect(err.status).toBe(409);
    expect(err.details).toEqual({
      item_id: "item_edit_short",
      source_version: 1,
      current_source_version: 2,
    });
  });

  /* The GET-only `unauthorizedHandler` in tests/msw/handlers.ts cannot serve
     this: a PATCH would fall through to onUnhandledRequest: "error". */
  it("surfaces 401 unauthorized through the PATCH-specific handler", async () => {
    server.use(unauthorizedPatchHandler("/api/v1/knowledge-items/:itemId"));
    const err = await rejection(patch("item_edit_short", { title: "x" }));
    expect(err.code).toBe("unauthorized");
    expect(err.status).toBe(401);
    expect(err.details).toEqual({});
  });

  it("surfaces the enveloped 422 as invalid_request with FastAPI's error list", async () => {
    const errors = [
      {
        type: "extra_forbidden",
        loc: ["body", "confidence"],
        msg: "Extra inputs are not permitted",
        input: 0.9,
      },
    ];
    server.use(
      knowledgeItemErrorHandler(422, validationFailedEnvelope(errors)),
    );
    const err = await rejection(patch("item_edit_short", { title: "x" }));
    expect(err.code).toBe("invalid_request");
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ errors });
    /* 422 and the empty-body 400 share a code — status is what separates them. */
    expect(err.message).toBe("Request validation failed.");
  });

  /* Robustness, not the contract: docs/edit-api-contract.md §3 says this route
     re-envelopes its 422. If a deployment ever answers FastAPI's raw
     HTTPValidationError instead, client.ts must still produce an ApiError. */
  it("degrades a non-envelope 422 body to bad_response", async () => {
    server.use(
      knowledgeItemErrorHandler(422, {
        detail: [
          {
            type: "extra_forbidden",
            loc: ["body", "confidence"],
            msg: "Extra inputs are not permitted",
            input: 0.9,
          },
        ],
      }),
    );
    const err = await rejection(patch("item_edit_short", { title: "x" }));
    expect(err.code).toBe("bad_response");
    expect(err.status).toBe(422);
    expect(err.details).toEqual({});
  });

  /* ---------- guard order ---------- */

  /* Asserted through the handler's own observation rather than assumed: the
     empty body DID reach the handler at an unknown id and still came back
     404, which is what proves the not-found guard runs ahead of the
     empty-body 400 (backend routes/review.py:263-279). */
  it("answers an empty body at an unknown id with 404, not 400", async () => {
    const seen: { itemId: string; body: KnowledgeItemUpdateRequest }[] = [];
    server.use(
      knowledgeItemPatchHandler(editableItemsFixture, (itemId, body) => {
        seen.push({ itemId, body });
      }),
    );

    const err = await rejection(patch("item_edit_nowhere", {}));
    expect(err.code).toBe("knowledge_item_not_found");
    expect(err.status).toBe(404);
    expect(seen).toEqual([{ itemId: "item_edit_nowhere", body: {} }]);
  });

  /* ---------- fixture hygiene ---------- */

  it("carries the contract's response fields and synthetic ids only", () => {
    const canonicalCodes = Object.keys(SOFT_WARNING_MESSAGES);

    for (const item of [...editableItemsFixture, decidedItemFixture]) {
      expect(Object.keys(item).sort()).toEqual([
        "display",
        "knowledge_item",
        "source_citations",
      ]);
      const ki = item.knowledge_item;
      expect(Object.keys(ki).sort()).toEqual([
        "confidence",
        "document_id",
        "edited_at",
        "id",
        "item_type",
        "review_reasons",
        "source_span_ids",
        "status",
        "structured_data",
        "summary",
        "title",
      ]);
      expect(Object.keys(ki.structured_data).sort()).toEqual([
        "cook_time",
        "ingredients",
        "ingredients_text",
        "prep_time",
        "schema",
        "steps",
        "steps_text",
        "total_time",
        "warnings",
        "yield",
      ]);
      expect(Object.keys(item.display).sort()).toEqual(["subtitle", "title"]);

      for (const line of ki.structured_data.ingredients ?? []) {
        expect(Object.keys(line).sort()).toEqual([
          "confidence",
          "item_normalized",
          "item_text",
          "notes",
          "position",
          "preparation",
          "quantity_text",
          "quantity_value",
          "raw_text",
          "unit_normalized",
          "unit_raw",
        ]);
      }
      for (const line of ki.structured_data.steps ?? []) {
        expect(Object.keys(line).sort()).toEqual([
          "confidence",
          "source_span_ids",
          "step_number",
          "text",
        ]);
      }

      expect(ki.id).toMatch(/^item_/);
      expect(ki.document_id).toMatch(/^doc_/);
      expect(ki.source_span_ids.every((s) => s.startsWith("span_"))).toBe(true);
      /* No invented warning codes — only the seven canonical ones. */
      for (const code of ki.structured_data.warnings ?? []) {
        expect(canonicalCodes).toContain(code);
      }
      /* review_reasons is the copy-table projection of warnings. */
      expect(ki.review_reasons).toEqual(
        ki.status === "needs_review"
          ? (ki.structured_data.warnings ?? []).map((code) => ({
              code,
              message: SOFT_WARNING_MESSAGES[code],
            }))
          : [],
      );
    }
  });
});

/* The mocked edit HOOK (5.2 TASK-004). The block above proves the wire; this
   one proves the cache choreography around it — a WRITE into
   ['knowledge-item', id] (never an invalidation, PLAN D5), the ['review-items']
   invalidation on settle and nothing else (D6), and the ordering the 5.4 seam
   depends on: the write lands BEFORE the caller's onSettled, the invalidation
   after it (D12). */
describe("useUpdateKnowledgeItem", () => {
  const pristine = (id: string): KnowledgeItemResponse => {
    const found = editableItemsFixture.find(
      (item) => item.knowledge_item.id === id,
    );
    if (!found) {
      throw new Error(`No editable fixture '${id}'.`);
    }
    return found;
  };

  const CORRECTED = "Skillet Cornbread, corrected";

  /** Counts GETs against one item id — `server.events` is the file-wide
      idiom (tests/recipe/panels.test.tsx); the file's afterEach drops it. */
  const itemGetCounter = (itemId: string) => {
    let gets = 0;
    server.events.on("request:start", ({ request: outgoing }) => {
      if (
        outgoing.method === "GET" &&
        outgoing.url.includes(`/api/v1/knowledge-items/${itemId}`)
      ) {
        gets += 1;
      }
    });
    return () => gets;
  };

  it("resolves the server's refreshed item", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useUpdateKnowledgeItem("item_edit_noingredients"),
      { wrapper },
    );

    const response = await result.current.mutateAsync({
      title: "Maple Cutout Cookies, corrected",
    });

    expect(response.knowledge_item.title).toBe(
      "Maple Cutout Cookies, corrected",
    );
    expect(response.knowledge_item.edited_at).toEqual(expect.any(String));
    expect(response.knowledge_item.status).toBe("needs_review");
  });

  /* Two tests for the one criterion, because the two halves cannot be
     asserted on the same cache entry: reference identity only survives when
     the key is EMPTY (TanStack's structural sharing rebuilds the top-level
     object when it merges over existing data), while "no refetch" is only
     observable when the key is populated AND actively observed. */
  it("writes the resolved response into ['knowledge-item', id], firing no GET", async () => {
    server.use(...editScenario(editableItemsFixture));
    const gets = itemGetCounter("item_edit_short");

    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useUpdateKnowledgeItem("item_edit_short"),
      { wrapper },
    );

    let response: KnowledgeItemResponse | undefined;
    await act(async () => {
      response = await result.current.mutateAsync({ title: CORRECTED });
      /* Long enough for an invalidation-driven refetch to have fired. */
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(
      queryClient.getQueryData(["knowledge-item", "item_edit_short"]),
    ).toBe(response);
    expect(gets()).toBe(0);
  });

  /* The D5 criterion where it bites: an ACTIVE ['knowledge-item', id]
     observer is mounted, so an invalidation (rather than a write) would
     refire the GET and the counter would read 2. */
  it("leaves an active reader on the patched item without refetching it", async () => {
    server.use(...editScenario(editableItemsFixture));
    const gets = itemGetCounter("item_edit_short");

    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => ({
        read: useKnowledgeItem("item_edit_short"),
        update: useUpdateKnowledgeItem("item_edit_short"),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.read.isSuccess).toBe(true));
    expect(gets()).toBe(1);

    await act(async () => {
      await result.current.update.mutateAsync({ title: CORRECTED });
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(gets()).toBe(1);
    expect(result.current.read.data?.knowledge_item.title).toBe(CORRECTED);
    expect(result.current.read.data?.knowledge_item.edited_at).toEqual(
      expect.any(String),
    );
  });

  it("invalidates ['review-items'] on settle and nothing else", async () => {
    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(["review-items", null], { review_items: [] });
    queryClient.setQueryData(["documents"], { documents: [] });
    queryClient.setQueryData(["document", "doc_edit"], { document: {} });

    const { result } = renderHook(
      () => useUpdateKnowledgeItem("item_edit_short"),
      { wrapper },
    );
    await result.current.mutateAsync({ title: CORRECTED });

    expect(
      queryClient.getQueryState(["review-items", null])?.isInvalidated,
    ).toBe(true);
    /* D6 — an edit leaves the item needs_review, so no shelf count moves. */
    expect(queryClient.getQueryState(["documents"])?.isInvalidated).toBe(false);
    expect(
      queryClient.getQueryState(["document", "doc_edit"])?.isInvalidated,
    ).toBe(false);
  });

  it("still invalidates ['review-items'] when the patch fails, writing nothing", async () => {
    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(["review-items", null], { review_items: [] });

    const { result } = renderHook(
      () => useUpdateKnowledgeItem("item_edit_nowhere"),
      { wrapper },
    );
    await expect(
      result.current.mutateAsync({ title: "x" }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(
      queryClient.getQueryState(["review-items", null])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryData(["knowledge-item", "item_edit_nowhere"]),
    ).toBeUndefined();
  });

  /* NOT review.test.tsx's log: the cache write sits BEFORE the caller's
     callback (D12). Copying that assertion unchanged would pin the very bug
     D12 exists to prevent. */
  it("runs onMutate → request → setQueryData → onSettled → invalidate", async () => {
    const log: string[] = [];
    server.use(
      knowledgeItemPatchHandler(editableItemsFixture, () =>
        log.push("request"),
      ),
    );

    const { queryClient, wrapper } = makeWrapper();
    const originalSet = queryClient.setQueryData.bind(queryClient);
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    vi.spyOn(queryClient, "setQueryData").mockImplementation(
      (queryKey, updater) => {
        log.push("setQueryData");
        return originalSet(queryKey, updater);
      },
    );
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters) => {
      log.push("invalidate");
      return originalInvalidate(filters);
    });

    const { result } = renderHook(
      () =>
        useUpdateKnowledgeItem("item_edit_short", {
          onMutate: () => {
            log.push("onMutate");
          },
          onSettled: () => {
            log.push("onSettled");
          },
        }),
      { wrapper },
    );
    await result.current.mutateAsync({ title: CORRECTED });

    expect(log).toEqual([
      "onMutate",
      "request",
      "setQueryData",
      "onSettled",
      "invalidate",
    ]);
  });

  /* D12 made observable rather than merely stated — the contract 5.4's Save
     and Save-and-approve hang off. */
  it("shows a caller's onSettled the freshly written item", async () => {
    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(
      ["knowledge-item", "item_edit_short"],
      pristine("item_edit_short"),
    );

    let seen: string | undefined;
    const { result } = renderHook(
      () =>
        useUpdateKnowledgeItem("item_edit_short", {
          onSettled: () => {
            seen = (
              queryClient.getQueryData(["knowledge-item", "item_edit_short"]) as
                | KnowledgeItemResponse
                | undefined
            )?.knowledge_item.title;
          },
        }),
      { wrapper },
    );
    await result.current.mutateAsync({ title: CORRECTED });

    expect(seen).toBe(CORRECTED);
  });

  /* Two saves of the same item, the FIRST one slow. Unserialized, its stale
     response settles last and overwrites the newer one — and because D5 writes
     the item entry instead of invalidating it, nothing would correct it. */
  it("serializes concurrent saves of the same item", async () => {
    let seen = 0;
    server.use(
      http.patch(
        "/api/v1/knowledge-items/:itemId",
        async ({ request: incoming }) => {
          const body = (await incoming.json()) as KnowledgeItemUpdateRequest;
          seen += 1;
          if (seen === 1) {
            await new Promise((resolve) => setTimeout(resolve, 60));
          }
          return HttpResponse.json(
            applyPatch(pristine("item_edit_short"), body),
          );
        },
      ),
    );

    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useUpdateKnowledgeItem("item_edit_short"),
      { wrapper },
    );

    await act(async () => {
      await Promise.all([
        result.current.mutateAsync({ title: "first save" }),
        result.current.mutateAsync({ title: "second save" }),
      ]);
    });

    expect(
      (
        queryClient.getQueryData(["knowledge-item", "item_edit_short"]) as
          | KnowledgeItemResponse
          | undefined
      )?.knowledge_item.title,
    ).toBe("second save");
  });

  /* The other half of the D12 seam: 5.4's Save-and-approve is an ASYNC caller
     callback, and a failing approve must not retroactively fail an edit the
     server already committed. Left unisolated, the rejection lands in
     query-core's own catch — onError, a SECOND onSettled with (undefined,
     error), and a rejected mutateAsync. */
  it("keeps a committed patch successful when the caller's onSettled rejects", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(["review-items", null], { review_items: [] });

    const onError = vi.fn();
    const boom = new Error("the approve that followed the save failed");
    const onSettled = vi.fn().mockRejectedValue(boom);

    const { result } = renderHook(
      () => useUpdateKnowledgeItem("item_edit_short", { onError, onSettled }),
      { wrapper },
    );

    const response = await result.current.mutateAsync({ title: CORRECTED });

    expect(response.knowledge_item.title).toBe(CORRECTED);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
    /* The settle work still completes, exactly once. */
    expect(
      queryClient.getQueryData(["knowledge-item", "item_edit_short"]),
    ).toBe(response);
    expect(
      queryClient.getQueryState(["review-items", null])?.isInvalidated,
    ).toBe(true);
    /* Isolated, not swallowed. */
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("onSettled callback rejected"),
      boom,
    );
    consoleError.mockRestore();
  });

  /* The seam's contract made runnable: the downstream failure stays
     observable to UI code — it is rendered from the caller's own state, not
     from the PATCH mutation's, because the PATCH did succeed. This is the
     shape 5.4's Save-and-approve has to take. */
  it("lets a caller render a failed follow-up while the save reads as saved", async () => {
    const { wrapper } = makeWrapper();

    const approve = vi
      .fn()
      .mockRejectedValue(new ApiError("review_not_pending", "gone", {}, 404));
    let approveFailed: string | undefined;

    const { result } = renderHook(
      () =>
        useUpdateKnowledgeItem("item_edit_short", {
          onSettled: async () => {
            try {
              await approve();
            } catch (error) {
              approveFailed = (error as ApiError).code;
            }
          },
        }),
      { wrapper },
    );

    await result.current.mutateAsync({ title: CORRECTED });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approveFailed).toBe("review_not_pending");
  });

  it("fires caller onError once on a 404 and still does its settle work", async () => {
    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(["review-items", null], { review_items: [] });

    const onError = vi.fn();
    const onSettled = vi.fn();
    const { result } = renderHook(
      () => useUpdateKnowledgeItem("item_edit_nowhere", { onError, onSettled }),
      { wrapper },
    );

    await expect(
      result.current.mutateAsync({ title: "x" }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(ApiError);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryState(["review-items", null])?.isInvalidated,
    ).toBe(true);
  });

  /* ---------- the contract's error table, reaching the caller ---------- */

  const errorRows: {
    name: string;
    itemId: string;
    body: KnowledgeItemUpdateRequest;
    status: number;
    envelope: ReturnType<typeof emptyPatchEnvelope>;
    use?: () => void;
  }[] = [
    {
      name: "400 invalid_request",
      itemId: "item_edit_short",
      body: {},
      status: 400,
      envelope: emptyPatchEnvelope("item_edit_short"),
    },
    {
      name: "404 knowledge_item_not_found",
      itemId: "item_edit_nowhere",
      body: { title: "x" },
      status: 404,
      envelope: knowledgeItemNotFoundEnvelope("item_edit_nowhere"),
    },
    {
      name: "404 review_not_pending",
      itemId: decidedItemFixture.knowledge_item.id,
      body: { title: "x" },
      status: 404,
      envelope: reviewNotPendingEnvelope(
        decidedItemFixture.knowledge_item.id,
        "ready",
      ),
      use: () => server.use(knowledgeItemPatchHandler([decidedItemFixture])),
    },
    {
      name: "409 ingestion_already_running",
      itemId: "item_edit_short",
      body: { title: "x" },
      status: 409,
      envelope: ingestionAlreadyRunningEnvelope(
        "doc_baking",
        "extracting_items",
      ),
      use: () =>
        server.use(
          knowledgeItemErrorHandler(
            409,
            ingestionAlreadyRunningEnvelope("doc_baking", "extracting_items"),
          ),
        ),
    },
    {
      name: "409 review_item_stale",
      itemId: "item_edit_short",
      body: { title: "x" },
      status: 409,
      envelope: reviewItemStaleEnvelope("item_edit_short", 1, 2),
      use: () =>
        server.use(
          knowledgeItemErrorHandler(
            409,
            reviewItemStaleEnvelope("item_edit_short", 1, 2),
          ),
        ),
    },
    {
      name: "401 unauthorized",
      itemId: "item_edit_short",
      body: { title: "x" },
      status: 401,
      envelope: unauthorizedEnvelope,
      use: () =>
        server.use(unauthorizedPatchHandler("/api/v1/knowledge-items/:itemId")),
    },
    {
      name: "422 invalid_request",
      itemId: "item_edit_short",
      body: { title: "x" },
      status: 422,
      envelope: validationFailedEnvelope([
        { type: "string_too_short", loc: ["body", "title"], msg: "too short" },
      ]),
      use: () =>
        server.use(
          knowledgeItemErrorHandler(
            422,
            validationFailedEnvelope([
              {
                type: "string_too_short",
                loc: ["body", "title"],
                msg: "too short",
              },
            ]),
          ),
        ),
    },
  ];

  for (const row of errorRows) {
    it(`surfaces ${row.name} to the caller as ApiError`, async () => {
      row.use?.();
      const { wrapper } = makeWrapper();
      const { result } = renderHook(() => useUpdateKnowledgeItem(row.itemId), {
        wrapper,
      });

      const err: unknown = await result.current
        .mutateAsync(row.body)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiError);
      const apiError = err as ApiError;
      expect(apiError.status).toBe(row.status);
      expect(apiError.code).toBe(row.envelope.error.code);
      /* The enveloped copy, verbatim — the form renders it. */
      expect(apiError.message).toBe(row.envelope.error.message);
      expect(apiError.details).toEqual(row.envelope.error.details);
    });
  }
});
