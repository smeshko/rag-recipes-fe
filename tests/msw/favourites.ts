import { HttpResponse, http } from "msw";
import type { KnowledgeItemSummary } from "../../src/api";

/* Favourites fixtures and handlers.

   `GET /favourites` returns the SAME listing row as the shelf and the queue
   (the backend reuses one projection), so these rows are built to that shape
   and nothing here invents a second card contract.

   Two handler sets, and the split matters:

   - `emptyFavouritesHandler` is STATELESS and lives in the base server. The
     search grid reads ['favourites'] on every render, so without a default
     every search test would trip `onUnhandledRequest: "error"` — and "nothing
     is starred" is the honest default for a fixture backend.
   - `favouritesScenario(...)` is STATEFUL and is applied per test via
     `server.use()`, following the `reviewScenario` rule in `msw/server.ts`:
     closure state in a base handler would survive `resetHandlers()` and leak
     into the next test. */

export const favouriteRow = (
  overrides: Partial<KnowledgeItemSummary> & Pick<KnowledgeItemSummary, "id">,
): KnowledgeItemSummary => ({
  title: "Saved Recipe",
  summary: "Something worth cooking twice.",
  item_type: "recipe",
  status: "ready",
  document: { id: "doc_baking", title: "bakingwithlesssugar" },
  source_pages: { page_start: 41, page_end: 43 },
  extraction: {
    schema: "recipe.v1",
    yield: "Serves 4",
    top_ingredients: ["maple syrup", "flour", "butter"],
    confidence_overall: 0.91,
  },
  flags: [],
  edited_at: null,
  favourited_at: "2026-08-25T09:00:00Z",
  ...overrides,
});

export const favouritesFixture: KnowledgeItemSummary[] = [
  favouriteRow({
    id: "ki_maple_cutouts",
    title: "Maple Cutout Cookies",
    summary: "Crisp maple-sweetened cutout cookies for decorating.",
    favourited_at: "2026-08-25T09:00:00Z",
  }),
  favouriteRow({
    id: "ki_bean_stew",
    title: "Bean Stew",
    summary: "A slow-simmered pot of beans for a cold evening.",
    document: { id: "doc_onepan", title: "onepantorulethemall" },
    source_pages: { page_start: 12, page_end: null },
    favourited_at: "2026-08-24T09:00:00Z",
  }),
];

/** The base server's default: nothing starred, no state. */
export const emptyFavouritesHandler = http.get("/api/v1/favourites", () =>
  HttpResponse.json({ knowledge_items: [] }),
);

export const favouriteNotFoundEnvelope = (itemId: string) => ({
  error: {
    code: "knowledge_item_not_found",
    message: `Knowledge item '${itemId}' not found.`,
    details: { item_id: itemId },
  },
});

export interface FavouritesScenarioOptions {
  /** Fail every write with this envelope + status, to exercise the rollback. */
  writeFails?: { status: number; message: string };
  /** Records each write as [method, itemId], in order. */
  onWrite?: (method: "PUT" | "DELETE", itemId: string) => void;
}

/**
 * A favourites backend that remembers: PUT adds, DELETE removes, GET reflects
 * both. Idempotent in both directions, like the real one — a repeated PUT does
 * not duplicate a row and a repeated DELETE is still a 204.
 */
export function favouritesScenario(
  initial: KnowledgeItemSummary[] = [],
  options: FavouritesScenarioOptions = {},
) {
  let rows = [...initial];

  const write = (method: "PUT" | "DELETE", itemId: string) => {
    options.onWrite?.(method, itemId);
    if (options.writeFails) {
      return HttpResponse.json(
        {
          error: {
            code: "internal_error",
            message: options.writeFails.message,
            details: {},
          },
        },
        { status: options.writeFails.status },
      );
    }
    if (method === "PUT") {
      if (!rows.some((row) => row.id === itemId)) {
        rows = [
          favouriteRow({ id: itemId, favourited_at: "2026-08-25T10:00:00Z" }),
          ...rows,
        ];
      }
      return HttpResponse.json({
        favourite: {
          knowledge_item_id: itemId,
          favourited_at: "2026-08-25T10:00:00Z",
        },
      });
    }
    rows = rows.filter((row) => row.id !== itemId);
    return new HttpResponse(null, { status: 204 });
  };

  return [
    http.get("/api/v1/favourites", ({ request }) => {
      /* Paged exactly as the backend pages, so the client's page walk is
         exercised rather than assumed. */
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get("limit") ?? "200");
      const offset = Number(url.searchParams.get("offset") ?? "0");
      return HttpResponse.json({
        knowledge_items: rows.slice(offset, offset + limit),
      });
    }),
    http.put("/api/v1/knowledge-items/:itemId/favourite", ({ params }) =>
      write("PUT", String(params.itemId)),
    ),
    http.delete("/api/v1/knowledge-items/:itemId/favourite", ({ params }) =>
      write("DELETE", String(params.itemId)),
    ),
  ];
}
