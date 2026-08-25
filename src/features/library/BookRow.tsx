import { Link, useLocation } from "react-router";
import type {
  DocumentCounts,
  DocumentDetailResponse,
  DocumentListItem,
} from "../../api";
import {
  ApiError,
  TERMINAL_STATUSES,
  useIngestionStatus,
  useReprocess,
} from "../../api";
import { Bloom, Pill, withReturnTo } from "../../ui";
import { reviewQueueUrl } from "../review/reviewQueueUrl";
import { CalmNotice } from "./CalmNotice";
import { IngestionProgress } from "./IngestionProgress";
import { isReadyIsh, spineAccent, statusPill } from "./presentation";
import { relativeTime } from "./relativeTime";

/* The detail query's three states each have a defined render — an errored
   query counts as settled (a 4xx is terminal under the retry policy). */
export type DetailState =
  | { status: "pending" }
  | { status: "error" }
  | { status: "success"; detail: DocumentDetailResponse };

export interface BookRowProps {
  doc: DocumentListItem;
  detail: DetailState;
  index: number;
  /** Test-only polling knobs (intervalMs/stallLimit); production omits it. */
  pollOptions?: { intervalMs?: number; stallLimit?: number };
}

function isTerminal(status: DocumentListItem["status"]): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** The handwritten shelf: a book with no file behind it, whose recipes were
    typed rather than extracted. A plain string compare because `source_type`
    is typed `string` on the list item — the backend's enum, not ours. */
function isHandwritten(doc: DocumentListItem): boolean {
  return doc.source_type === "manual";
}

function subtitleFor(doc: DocumentListItem, detail: DetailState): string {
  if (detail.status === "pending") {
    return "…";
  }
  if (detail.status === "error") {
    return "—";
  }
  if (isHandwritten(doc)) {
    /* "0 pages scanned" is technically true and completely wrong: nothing was
       scanned because nothing was ever a page. */
    return "written by hand";
  }
  if (isReadyIsh(doc.status)) {
    return `${detail.detail.counts.source_spans} pages scanned`;
  }
  const added = `added ${relativeTime(detail.detail.document.created_at)}`;
  const { subcategory } = detail.detail.document;
  return subcategory ? `${added} · ${subcategory}` : added;
}

function CountCell({
  value,
  label,
  danger = false,
}: {
  value: number | undefined;
  label: string;
  danger?: boolean;
}) {
  return (
    <div>
      <b
        className={`block text-[18px] font-semibold ${danger ? "text-danger" : ""}`}
      >
        {value ?? "—"}
      </b>
      {/* Eyebrow's weight and tracking, inlined: this is a caption under a
          number rather than a section label, so it does not want the
          component's inline-flex box. */}
      <small className="text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
        {label}
      </small>
    </div>
  );
}

/* The three counts fit 335px at the 26px gap (~217px measured), but only
   just — the phone tier trims it so a four-digit chunk count still can't
   force a wrap mid-row. */
const COUNTS_LAYOUT =
  "flex flex-wrap gap-[26px] py-5 max-[880px]:col-start-2 max-[880px]:pt-0 max-[880px]:pr-6 max-[880px]:pb-5 max-[560px]:gap-x-5";

function CountsRow({
  state,
  counts,
}: {
  state: "pending" | "error" | "success";
  counts: DocumentCounts | undefined;
}) {
  if (state === "pending") {
    return (
      <div
        className={COUNTS_LAYOUT}
        data-testid="counts-skeleton"
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-11 w-14 animate-pulse rounded-md bg-skeleton/70"
          />
        ))}
      </div>
    );
  }
  return (
    <div className={COUNTS_LAYOUT}>
      <CountCell value={counts?.ready_items} label="recipes" />
      <CountCell
        value={counts?.needs_review_items}
        label="to review"
        danger={(counts?.needs_review_items ?? 0) > 0}
      />
      <CountCell value={counts?.chunks} label="chunks" />
    </div>
  );
}

export function BookRow({ doc, detail, index, pollOptions }: BookRowProps) {
  const counts = detail.status === "success" ? detail.detail.counts : undefined;
  const pill = statusPill(doc.status, counts?.needs_review_items);
  /* Per-row, deliberately: lifting this into LibraryPage and threading it
     down would make the next link-out someone else's plumbing problem. */
  const location = useLocation();

  /* Called unconditionally at the top level — moving it inside the
     non-terminal branch would break the rules of hooks on the very
     transition this phase exists to handle. `failed` is terminal but still
     fetches ONCE (the interval sees terminal and never starts): without
     that fetch the note's "prefer progress.message when non-null" rule
     would be unreachable from the app. */
  const ingest = useIngestionStatus(doc.id, {
    enabled: !isTerminal(doc.status) || doc.status === "failed",
    /* The list's own verdict. A terminal payload only means "the shelf is
       stale, refresh it" when it disagrees with this — a failed row is
       fetched once BECAUSE it is terminal and must not invalidate on mount,
       but a row the list still calls `failed` after someone else reprocessed
       it to `ready` must. */
    listStatus: doc.status,
    ...pollOptions,
  });

  const reprocess = useReprocess(doc.id);
  const reprocessError =
    reprocess.error instanceof ApiError ? reprocess.error : null;
  const alreadyRunning = reprocessError?.code === "ingestion_already_running";
  /* A 404 refreshes the stale row away — surfacing it would alarm over a
     row that is about to disappear. */
  const quietError =
    alreadyRunning || reprocessError?.code === "document_not_found";

  return (
    <Bloom index={index} base={0.18} step={0.04} className="mb-4">
      {/* `relative isolate` is the positioning context for the title link's
          stretched hit area below — `isolate` so the z-10 the sibling controls
          carry is scoped to this card and cannot outrank anything outside it. */}
      {/* A list row, not a raised card: hairline box, no shadow, and a fill on
          hover instead of a lift. The whole row is one hit target (see the
          stretched link below), so the fill is also the affordance — nothing
          else on the row says "this is clickable". */}
      <article className="relative isolate grid grid-cols-[6px_minmax(0,1.4fr)_minmax(0,2fr)_auto] items-center gap-6 overflow-hidden rounded-card border border-border bg-surface-raised transition-colors duration-150 hover:bg-surface-hover max-[880px]:grid-cols-[6px_1fr]">
        <span
          aria-hidden="true"
          className={`self-stretch ${spineAccent(doc.status, doc.id)}`}
        />
        <div className="py-5">
          {/* The whole card is the way into the book's contents — but only
              once there is something to list. A queued or mid-extraction book
              has no items yet, so it stays plain text rather than a link that
              lands on an empty page.

              STRETCHED LINK, not a wrapping <a>: this row also holds a review
              link and a Reprocess button, and an anchor around them would be
              invalid HTML and would swallow their clicks. So the title stays
              the one real link and grows an `::after` overlay across the card,
              while the sibling controls sit above it on `z-10`. The accessible
              name stays the book's title — a screen reader announces one link,
              not a card-sized mystery — and ⌘-click, middle-click and "copy
              link address" all still work anywhere on the row. */}
          <h3 className="text-[15px] font-semibold leading-[1.35]">
            {isReadyIsh(doc.status) ? (
              <Link
                to={withReturnTo(`/library/${doc.id}`, location)}
                className="transition-colors hover:text-accent after:absolute after:inset-0 after:content-['']"
              >
                {doc.title}
              </Link>
            ) : (
              doc.title
            )}
          </h3>
          <small className="mt-1 block text-[13px] text-fg-subtle">
            {subtitleFor(doc, detail)}
          </small>
        </div>
        {isReadyIsh(doc.status) ? (
          <CountsRow state={detail.status} counts={counts} />
        ) : doc.status === "failed" ? (
          /* Honest failure copy: names NO cause — status is only "failed"
             and progress.message is null today; prefer it if it ever lands. */
          <div className="py-5 text-[13px] text-fg-muted max-[880px]:col-start-2 max-[880px]:pt-0 max-[880px]:pr-6 max-[880px]:pb-5">
            <b className="text-danger">Ingestion failed.</b>{" "}
            {ingest.data?.progress.message ??
              "The API doesn't expose the reason yet."}
          </div>
        ) : (
          /* Not raised above the stretched overlay, and does not need to be:
             this branch is the `else` of `isReadyIsh`, which is the exact
             condition the overlay renders under — a row never has both. If the
             title ever becomes a link for non-ready books, this component's
             "check again" button needs `relative z-10` or it goes dead. */
          <IngestionProgress
            fallbackStatus={doc.status}
            data={ingest.data}
            stopReason={ingest.stopReason}
            checkAgain={ingest.checkAgain}
          />
        )}
        {/* `relative z-10`: above the title's stretched overlay, so the review
            link and Reprocess stay clickable rather than being covered by the
            card-wide hit area. */}
        <div className="relative z-10 py-5 pr-6 text-right max-[880px]:col-start-2 max-[880px]:pt-0 max-[880px]:pb-5 max-[880px]:pr-0 max-[880px]:text-left">
          <Pill size="md" tone={pill.tone}>
            {pill.label}
          </Pill>
          {(counts?.needs_review_items ?? 0) > 0 && (
            <Link
              to={withReturnTo(reviewQueueUrl(doc.id), location)}
              className="mt-2 block text-[13px] font-medium text-accent hover:underline pointer-coarse:min-h-11"
            >
              Open review queue →
            </Link>
          )}
          {/* Absent rather than disabled on the handwritten shelf, the same
              call `RecipeEditForm` makes for "Save & approve" on a shelved
              recipe: a greyed-out Reprocess invites you to work out why it
              will not press, when the honest answer is that the verb does not
              apply. There is no PDF to re-extract, and the backend answers 400
              to the attempt. */}
          {isTerminal(doc.status) && !isHandwritten(doc) && (
            <button
              type="button"
              disabled={reprocess.isPending}
              onClick={() => reprocess.mutate()}
              className="mt-2 block w-full text-right text-[13px] font-medium text-accent hover:underline disabled:opacity-50 pointer-coarse:min-h-11 max-[880px]:text-left"
            >
              {doc.status === "failed" ? "Retry ↻" : "Reprocess ↻"}
            </button>
          )}
          {alreadyRunning && (
            <CalmNotice>Already processing — hang tight.</CalmNotice>
          )}
          {reprocess.isError && !quietError && (
            <span
              role="alert"
              className="mt-2 block text-[13px] font-medium text-danger"
            >
              {reprocess.error instanceof Error
                ? reprocess.error.message
                : "Reprocess failed."}
            </span>
          )}
        </div>
      </article>
    </Bloom>
  );
}
