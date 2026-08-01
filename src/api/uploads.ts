import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, request } from "./client";
import { documentsQueryOptions } from "./documents";
import { route } from "./routes";
import type { components } from "./schema";
import type {
  BatchUploadItemResult,
  BatchUploadResponse,
  DocumentListItem,
  DocumentListResponse,
  UploadResponse,
} from "./types";

type SingleUploadBody =
  components["schemas"]["Body_upload_document_api_v1_documents_post"];
type BatchUploadBody =
  components["schemas"]["Body_upload_documents_batch_api_v1_documents_batch_post"];

/** The keys a body schema declares as required (no `?` modifier). */
type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];

/*
 * ARCHITECTURE.md: request bodies are generated and used directly, never
 * hand-written. FormData part names are plain strings, so bind them to the
 * generated schema here — the `satisfies` both pins each name to a real body
 * key (a backend rename stops compiling) and, because the Record key type is
 * the schema's REQUIRED set, fails to compile if the backend adds a required
 * field this form does not send. Without it a rename or a new required field
 * type-checks fine and 422s at runtime.
 *
 * `file` is optional in the schema (FastAPI types it `str | None`) but is the
 * whole point of the call, so it is named explicitly alongside the required
 * set. No title is sent — the backend derives it from the filename.
 */
const singleUploadFields = {
  file: "file",
  category: "category",
} as const satisfies Record<
  RequiredKeys<SingleUploadBody> | "file",
  keyof SingleUploadBody
>;

const batchUploadFields = {
  files: "files",
  category: "category",
} as const satisfies Record<
  RequiredKeys<BatchUploadBody>,
  keyof BatchUploadBody
>;

const DEFAULT_CATEGORY = "recipes";

/*
 * Multipart upload of one PDF: the file plus the default `category=recipes`.
 * The client sets no Content-Type, so the fetch implementation writes the
 * multipart boundary itself.
 */
export async function uploadDocument(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append(singleUploadFields.file, file);
  form.append(singleUploadFields.category, DEFAULT_CATEGORY);
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
    form.append(batchUploadFields.files, file);
  }
  form.append(batchUploadFields.category, DEFAULT_CATEGORY);
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
/**
 * How sure the client is that a failed file did NOT reach the shelf. Absent
 * on non-error items.
 *
 * - `refused`   — the server answered a definitive 4xx (415 magic-byte, 400
 *                 missing file). Nothing was committed; report it flatly.
 * - `unproven`  — the failure could have followed a commit: a 5xx, a dead
 *                 connection, or a 201 whose body never parsed. Reconcile the
 *                 shelf and say the book may still appear.
 * - `opaque`    — a batch item. The wire shape carries only the backend's
 *                 message string — no code, no status — so nothing can be
 *                 proven either way. Reconcile conservatively, but keep the
 *                 backend's message, which is the accurate reading for the
 *                 dominant unsupported-type case.
 */
export type FailureCertainty = "refused" | "unproven" | "opaque";

/*
 * Client-side outcome item: the wire `BatchUploadItemResult` plus what the
 * sequential path can additionally know — the ApiError code (batch errors
 * carry only the backend's message string) and the document title. Batch
 * responses pass through structurally unchanged apart from `certainty`: same
 * shape, not the same content (batch duplicate detection is authoritative;
 * the single path infers from the id snapshot and can miss).
 */
export interface UploadOutcomeItem extends BatchUploadItemResult {
  code?: string | null;
  title?: string | null;
  certainty?: FailureCertainty;
}

/*
 * Only an envelope-carrying 4xx proves the server refused the file before
 * committing anything. Everything else may have committed and then lost the
 * answer: a 5xx, a dead connection, and — because `request()` parses a
 * successful body with an unguarded `response.json()` — a raw SyntaxError
 * from a truncated 201, which is the MOST likely-committed case of all and
 * is not an ApiError at all. Default to "may have committed": the cost of
 * being wrong is one wasted list refetch, against a book that silently
 * never appears.
 */
export function classifyFailure(err: unknown): FailureCertainty {
  const refused =
    err instanceof ApiError &&
    err.status !== null &&
    err.status >= 400 &&
    err.status < 500;
  return refused ? "refused" : "unproven";
}

/** True when the shelf must be re-read because the file may have landed. */
export function isUnconfirmedFailure(
  item: Pick<UploadOutcomeItem, "certainty">,
): boolean {
  return item.certainty === "unproven" || item.certainty === "opaque";
}

export interface UploadSummary extends Omit<BatchUploadResponse, "items"> {
  items: UploadOutcomeItem[];
}

/*
 * Batch responses arrive already summarized, so this is a pass-through — with
 * one addition. The backend turns a per-file failure into an `error` ITEM
 * inside an overall 201, including failures that may have committed the
 * document first, and the item carries no code or status to tell them apart.
 * Marking every batch error `opaque` makes an all-error cohort reconcile the
 * shelf instead of asserting that nothing happened.
 */
export function normalizeBatchResponse(
  response: BatchUploadResponse,
): UploadSummary {
  return {
    ...response,
    items: response.items.map((item) =>
      item.status === "error"
        ? { ...item, certainty: "opaque" as const }
        : item,
    ),
  };
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
    const response = await queryClient.fetchQuery({
      ...documentsQueryOptions(),
      staleTime: 0,
    });
    documents = response.documents;
  } catch {
    documents =
      queryClient.getQueryData<DocumentListResponse>(["documents"])
        ?.documents ?? [];
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
        certainty: classifyFailure(err),
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
      if (files.length > 1 && !batchRefused(queryClient)) {
        try {
          return normalizeBatchResponse(await uploadDocumentsBatch(files));
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 409) {
            throw err;
          }
          memoizeBatchRefusal(queryClient);
        }
      }
      /* Snapshot only where it is consumed. Batch items carry an
         authoritative `status`, so on the batch path the walk (up to 26
         paginated requests) would be fetched and thrown away, delaying every
         multi-file drop. Taking it after a 409 loses no accuracy: the batch
         guard runs before the handler, so the refusal commits nothing. */
      return uploadSequentially(files, await shelfSnapshot(queryClient));
    },
    onSuccess: (summary) => {
      /* Batch duplicates are authoritative and can name a document the
         cache has never seen; on the single path this is a cheap no-op.
         A failure we cannot prove was a refusal invalidates too: the answer
         was lost, not necessarily the document, so the shelf is the only way
         to find out whether the book landed. Definitive 4xx items are the
         one case that deliberately stays quiet. */
      if (
        summary.created > 0 ||
        summary.duplicates > 0 ||
        summary.items.some(isUnconfirmedFailure)
      ) {
        void queryClient.invalidateQueries({ queryKey: ["documents"] });
      }
    },
    onError: (err) => {
      /* The batch call rejected as a whole, so there are no per-file items
         to inspect — a 5xx or a dead connection may still have committed
         part of the cohort. Reconcile rather than assert nothing happened. */
      if (classifyFailure(err) !== "refused") {
        void queryClient.invalidateQueries({ queryKey: ["documents"] });
      }
    },
  });
}
