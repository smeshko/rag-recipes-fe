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
import { handlers } from "./handlers";
import { knowledgeItemHandlers } from "./knowledgeItems";

/* Only STATELESS handlers belong here — `reviewScenario(...)` and
   `editScenario(...)` are per-test via `server.use()`: base-handler closure
   state would survive `resetHandlers()` and leak across tests.

   The edit handler sits after `knowledgeItemHandlers` (a different METHOD on
   the same path, so neither shadows the other — see the ordering comment in
   handlers.ts). */
export const server = setupServer(
  ...handlers,
  ...knowledgeItemHandlers,
  knowledgeItemPatchHandler(editableItemsFixture),
  reviewItemsHandler(reviewItemsFixture),
  reviewDecisionHandler(reviewItemsFixture),
);
