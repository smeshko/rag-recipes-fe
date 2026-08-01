import { setupServer } from "msw/node";
import {
  reviewDecisionHandler,
  reviewItemsFixture,
  reviewItemsHandler,
} from "../../src/mocks/review";
import { handlers } from "./handlers";
import { knowledgeItemHandlers } from "./knowledgeItems";

/* Only the STATELESS review pair belongs here — `reviewScenario(...)` is
   per-test via `server.use()`: base-handler closure state would survive
   `resetHandlers()` and leak decisions across tests. */
export const server = setupServer(
  ...handlers,
  ...knowledgeItemHandlers,
  reviewItemsHandler(reviewItemsFixture),
  reviewDecisionHandler(reviewItemsFixture),
);
