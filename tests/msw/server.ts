import { setupServer } from "msw/node";
import { handlers } from "./handlers";
import { knowledgeItemHandlers } from "./knowledgeItems";

export const server = setupServer(...handlers, ...knowledgeItemHandlers);
