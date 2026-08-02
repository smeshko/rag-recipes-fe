import {
  type DocumentDetailResponse,
  useDocumentDetails,
  useDocuments,
} from "../../api";
import { Bloom, Panel } from "../../ui";
import { BookRow, type DetailState } from "./BookRow";
import { Dropzone } from "./Dropzone";

/* Section blooms follow the mockup's 0/.06/(.1)/.14 chrome stagger — 0 is
   the Shell header, .1 is the dropzone's slot (arrives in phase 3.2). */

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

function detailStateOf(query: {
  isPending: boolean;
  isError: boolean;
  data: DocumentDetailResponse | undefined;
}): DetailState {
  if (query.isPending) {
    return { status: "pending" };
  }
  if (query.isError || query.data === undefined) {
    return { status: "error" };
  }
  return { status: "success", detail: query.data };
}

export function LibraryPage() {
  const documents = useDocuments();
  const docs = documents.data?.documents ?? [];
  const details = useDocumentDetails(docs.map((d) => d.id));

  const booksReady = docs.filter(
    (d) => d.status === "ready" || d.status === "needs_review",
  ).length;
  /* Settled includes errored DETAIL queries — a 4xx is terminal under the
     retry policy, so waiting on success alone would freeze the stats forever.

     The LIST query is different, and must be `isSuccess`, not merely
     "not pending": when it errors there are no docs and no details, so
     `details.every(...)` is vacuously true and the line would resolve to an
     exact "0 books ready · 0 recipes · 0 waiting for review" — a confident
     zero inventory printed directly above the "shelf could not be reached"
     panel. An outage is not an empty shelf. */
  const settled =
    documents.isSuccess && details.every((query) => !query.isPending);
  const unavailable = details.filter((query) => query.isError).length;
  const sumOf = (
    pick: (counts: {
      ready_items: number;
      needs_review_items: number;
    }) => number,
  ) =>
    details.reduce(
      (total, query) => total + (query.data ? pick(query.data.counts) : 0),
      0,
    );

  /* Never a silently-low bare number: with an errored book the sums cannot
     include it, so they degrade visibly to "N+" plus a note. */
  const marker = unavailable > 0 ? "+" : "";
  const statsLine = settled
    ? `${booksReady} ${plural(booksReady, "book")} ready · ${sumOf((c) => c.ready_items)}${marker} recipes · ${sumOf((c) => c.needs_review_items)}${marker} waiting for review`
    : "— books ready · — recipes · — waiting for review";

  return (
    <div>
      <Bloom duration={0.7} delay={0.06} className="pt-10 pb-2">
        <h1 className="font-display text-[clamp(30px,4vw,40px)] font-medium">
          The shelf, <em className="text-accent italic">as it stands.</em>
        </h1>
        <div className="mt-2 text-[15px] text-fg-muted">{statsLine}</div>
        {settled && unavailable > 0 && (
          <div className="mt-1 text-[13px] text-fg-subtle">
            counts unavailable for {unavailable} {plural(unavailable, "book")}
          </div>
        )}
      </Bloom>

      <Bloom duration={0.7} delay={0.1} className="mt-7">
        <Dropzone />
      </Bloom>

      <Bloom
        duration={0.7}
        delay={0.14}
        className="mt-11 mb-[18px] flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
      >
        <h2 className="font-display text-[24px] font-semibold">On the shelf</h2>
        <span className="text-[13px] text-fg-subtle">
          sorted by most recently added
        </span>
      </Bloom>

      {documents.isPending && (
        <div data-testid="shelf-loading" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="mb-4 h-[88px] animate-pulse rounded-[18px] border border-border bg-surface-raised/70"
            />
          ))}
        </div>
      )}

      {documents.isError && (
        <Panel className="text-[13.5px] text-fg-muted">
          <p role="alert">
            The shelf could not be reached. Try reloading in a moment.
          </p>
        </Panel>
      )}

      {documents.isSuccess && docs.length === 0 && (
        <Panel className="text-center">
          <p className="font-display text-[18px] font-semibold">
            Nothing on the shelf yet.
          </p>
          <p className="mt-1 text-[13.5px] text-fg-muted">
            Books you add will appear here, sorted by most recently added.
          </p>
        </Panel>
      )}

      {docs.map((doc, index) => (
        <BookRow
          key={doc.id}
          doc={doc}
          detail={detailStateOf(details[index])}
          index={index}
        />
      ))}
    </div>
  );
}
