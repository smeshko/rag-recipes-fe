import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
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
import { useKnowledgeItem } from "../../src/api/knowledgeItems";
import {
  decidedItemFixture,
  editableItemsFixture,
  editScenario,
  ingestionAlreadyRunningEnvelope,
  knowledgeItemErrorHandler,
  knowledgeItemPatchHandler,
  reviewItemStaleEnvelope,
  SOFT_WARNING_MESSAGES,
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
    expect(err.details).toEqual({ knowledge_item_id: "item_missing" });
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
   goes through `request(route(…, "patch"))`, so this block also proves
   TASK-002's edit-schema overlay end-to-end rather than only at compile time.

   NOTE the two spellings of `knowledge_item_not_found`'s `details` living in
   this one file: the GET 404 above asserts `{knowledge_item_id}` (the 2.2
   read fixture), the PATCH 404 below asserts `{item_id}` (the shipped
   backend's guard stack). That divergence is PLAN D8, not a bug; phase 5.4
   reconciles the review-side doc. */
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

    for (const body of [
      { title: "Honey Oat Sandwich Loaf, corrected" },
      { ingredients: ["2 cups bread flour", "1 tsp fine sea salt"] },
      { steps: ["Mix everything.", "Bake for 40 minutes."] },
    ] satisfies KnowledgeItemUpdateRequest[]) {
      const after = (await patch("item_edit_confidence", body)).knowledge_item;
      expect(after.structured_data.warnings).toEqual(codes);
      expect(after.review_reasons.map((r) => r.code)).toEqual(codes);
    }
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
