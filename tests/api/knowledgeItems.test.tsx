import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ApiError, documentDetailQueryOptions } from "../../src/api";
import { useDocument } from "../../src/api/documents";
import { useKnowledgeItem } from "../../src/api/knowledgeItems";
import { fullItemFixture, sparseItemFixture } from "../msw/knowledgeItems";

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
