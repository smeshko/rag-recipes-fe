import { request } from "./client";
import { route } from "./routes";
import type { UploadResponse } from "./types";

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
