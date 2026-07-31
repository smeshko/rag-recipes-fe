import { useQuery } from "@tanstack/react-query";
import { request } from "./client";
import { route } from "./routes";
import type { KnowledgeItemResponse } from "./types";

/* id is optional because useParams().id is string | undefined — the enabled
   guard replaces any non-null assertion at the call site. */
export function useKnowledgeItem(id: string | undefined) {
  return useQuery({
    queryKey: ["knowledge-item", id],
    enabled: Boolean(id),
    queryFn: () =>
      request<KnowledgeItemResponse>(
        route("/knowledge-items/{item_id}", "get", {
          params: { item_id: id as string },
        }),
      ),
  });
}
