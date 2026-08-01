/**
 * The library → review-queue URL contract: `/review?document=<id>` lands on
 * the queue pre-filtered to one book. It lives on the review side, beside
 * ReviewPage's `?document=` reader, so the emitting link (BookRow) and the
 * page's param reader cannot drift — the same both-ends-in-one-module
 * reasoning the retired search link-out documented in the library's
 * presentation module.
 */
export function reviewQueueUrl(documentId: string): string {
  const params = new URLSearchParams({ document: documentId });
  return `/review?${params.toString()}`;
}
