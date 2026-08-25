import { setupServer } from "msw/node";
import {
  editableItemsFixture,
  knowledgeItemPatchHandler,
} from "../../src/mocks/knowledgeItems";
import {
  reviewDecisionHandler,
  reviewItemsFixture,
  reviewItemsHandler,
} from "../../src/mocks/review";
import { emptyFavouritesHandler } from "./favourites";
import { handlers } from "./handlers";
import { knowledgeItemHandlers } from "./knowledgeItems";

/* Only STATELESS handlers belong here — `reviewScenario(...)`,
   `editScenario(...)` and `favouritesScenario(...)` are per-test via
   `server.use()`: base-handler closure state would survive `resetHandlers()`
   and leak across tests.

   `emptyFavouritesHandler` is not optional chrome: the search grid reads
   ['favourites'] to fill its stars, so every search test would otherwise trip
   `onUnhandledRequest: "error"`.

   The edit handler sits after `knowledgeItemHandlers` (a different METHOD on
   the same path, so neither shadows the other — see the ordering comment in
   handlers.ts). */
export const server = setupServer(
  ...handlers,
  ...knowledgeItemHandlers,
  emptyFavouritesHandler,
  knowledgeItemPatchHandler(editableItemsFixture),
  reviewItemsHandler(reviewItemsFixture),
  reviewDecisionHandler(reviewItemsFixture),
);
