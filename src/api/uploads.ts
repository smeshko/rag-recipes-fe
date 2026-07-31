import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, request } from "./client";
import { documentsQueryOptions } from "./documents";
import { route } from "./routes";
import type {
  BatchUploadItemResult,
  BatchUploadResponse,
  DocumentListItem,
  UploadResponse,
} from "./types";

/*
 * Multipart upload of one PDF. Fields per the generated
 * `Body_upload_document_api_v1_documents_post`: `file` plus the default
 * `category=recipes` — no title, the backend derives it from the filename.
 * The client sets no Content-Type, so the fetch implementation writes the
 * multipart boundary itself.
 */
export async function uploadDocument(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("category", "recipes");
  return request<UploadResponse>(route("/documents", "post"), { body: form });
}

/*
 * The duplicate response is byte-identical in shape to a create (201, no
 * flag) — prior id membership is the only reliable signal. Status plays no
 * part: a re-uploaded book that is still processing is still a duplicate.
 * Pure so it is trivially testable; the caller owns the snapshot.
 */
export function classifyUpload(
  response: UploadResponse,
  knownIds: ReadonlySet<string>,
): "created" | "duplicate" {
  return knownIds.has(response.document.id) ? "duplicate" : "created";
}

/*
 * Multipart cohort upload. The field is `files`, appended once per file —
 * NOT `files[]`: FastAPI has no bracket convention and would 422.
 */
export async function uploadDocumentsBatch(
  files: File[],
): Promise<BatchUploadResponse> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  form.append("category", "recipes");
  return request<BatchUploadResponse>(route("/documents/batch", "post"), {
    body: form,
  });
}

/*
 * Client-side outcome item: the wire `BatchUploadItemResult` plus what the
 * sequential path can additionally know — the ApiError code (batch errors
 * carry only the backend's message string) and the document title. Batch
 * responses pass through structurally unchanged: same shape, not the same
 * content (batch duplicate detection is authoritative; the single path
 * infers from the id snapshot and can miss).
 */
export interface UploadOutcomeItem extends BatchUploadItemResult {
  code?: string | null;
  title?: string | null;
}

export interface UploadSummary extends Omit<BatchUploadResponse, "items"> {
  items: UploadOutcomeItem[];
}

/** Pure aggregator: per-file items → the batch-shaped summary. */
export function summarizeOutcomes(items: UploadOutcomeItem[]): UploadSummary {
  return {
    items,
    total: items.length,
    created: items.filter((item) => item.status === "created").length,
    duplicates: items.filter((item) => item.status === "duplicate").length,
    errors: items.filter((item) => item.status === "error").length,
  };
}

/*
 * The batch capability memo. The 409 refusal is startup config on the
 * backend (llm_provider + anthropic_api_key) and each probe costs a full
 * cohort transfer — Starlette parses the whole multipart body before the
 * guard runs. Memoized in the QueryClient cache (per-test isolation for
 * free), never a module flag; gcTime Infinity because an observerless
 * setQueryData entry would otherwise be GC'd after 5 minutes and silently
 * re-probe. Lifetime is the page load — a reload re-probes, which is the
 * escape hatch after a backend reconfiguration.
 */
const BATCH_CAPABILITY_KEY = ["capabilities", "batch"] as const;

function batchRefused(queryClient: QueryClient): boolean {
  return queryClient.getQueryData(BATCH_CAPABILITY_KEY) === false;
}

function memoizeBatchRefusal(queryClient: QueryClient): void {
  queryClient.setQueryDefaults(BATCH_CAPABILITY_KEY, {
    gcTime: Number.POSITIVE_INFINITY,
  });
  queryClient.setQueryData(BATCH_CAPABILITY_KEY, false);
}

/*
 * Snapshot the shelf's known ids as of this moment. fetchQuery (never
 * ensureQueryData — that resolves from a populated cache and only
 * revalidates fire-and-forget) with staleTime 0 awaits a fresh list; its
 * queryKey/queryFn pair is 3.1's documentsQueryOptions, so both writers of
 * ['documents'] share one shape. A failed refresh degrades the classifier
 * to the cached snapshot instead of blocking the upload.
 */
async function shelfSnapshot(queryClient: QueryClient): Promise<Set<string>> {
  let documents: DocumentListItem[];
  try {
    documents = await queryClient.fetchQuery({
      ...documentsQueryOptions(),
      staleTime: 0,
    });
  } catch {
    documents =
      queryClient.getQueryData<DocumentListItem[]>(["documents"]) ?? [];
  }
  return new Set(documents.map((doc) => doc.id));
}

/*
 * Strictly sequential singles (epic wording; also avoids hammering sync
 * extraction). The known-id set GROWS as the run proceeds: each returned id
 * is folded in before the next file is classified, so the same file dropped
 * twice in one cohort reports created + duplicate, not two creations.
 */
async function uploadSequentially(
  files: File[],
  knownIds: Set<string>,
): Promise<UploadSummary> {
  const items: UploadOutcomeItem[] = [];
  for (const file of files) {
    try {
      const response = await uploadDocument(file);
      const status = classifyUpload(response, knownIds);
      knownIds.add(response.document.id);
      items.push({
        filename: file.name,
        status,
        document_id: response.document.id,
        error: null,
        code: null,
        title: response.document.title,
      });
    } catch (err) {
      items.push({
        filename: file.name,
        status: "error",
        document_id: null,
        error: err instanceof Error ? err.message : String(err),
        code: err instanceof ApiError ? err.code : null,
        title: null,
      });
    }
  }
  return summarizeOutcomes(items);
}

/*
 * One-or-many files → one normalized per-file summary. >1 file tries the
 * batch endpoint once per page load; a 409 from the batch call alone (the
 * refusal's code is the generic invalid_request — never match on code)
 * memoizes the refusal and falls back to sequential singles. Any other
 * batch error surfaces unchanged.
 */
export function useUploadBooks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]): Promise<UploadSummary> => {
      const knownIds = await shelfSnapshot(queryClient);
      if (files.length > 1 && !batchRefused(queryClient)) {
        try {
          return await uploadDocumentsBatch(files);
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 409) {
            throw err;
          }
          memoizeBatchRefusal(queryClient);
        }
      }
      return uploadSequentially(files, knownIds);
    },
    onSuccess: (summary) => {
      /* Batch duplicates are authoritative and can name a document the
         cache has never seen; on the single path this is a cheap no-op. */
      if (summary.created > 0 || summary.duplicates > 0) {
        void queryClient.invalidateQueries({ queryKey: ["documents"] });
      }
    },
  });
}
