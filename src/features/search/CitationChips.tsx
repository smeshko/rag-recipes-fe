import { Fragment } from "react";
import { Link, useLocation } from "react-router";
import type { AnswerCitation } from "../../api";
import { withReturnTo } from "../../ui";
import {
  type AnswerBlock,
  type InlineSegment,
  parseAnswerText,
} from "./answerText";

export type CitationMap = Map<string, AnswerCitation>;

function Chip({ citation }: { citation: AnswerCitation }) {
  /* Every chip on this page captures the same URL. That is correct — the
     provenance is where the reader was, not which chip they took. */
  const location = useLocation();
  /* The visible label is a page reference ("pp. 33–35") but the destination
     is the recipe record — the backend has no source-page endpoint yet
     (ARCHITECTURE.md open question 4). Name the destination explicitly so the
     control does not misrepresent itself; the visible text stays the leading
     part of the accessible name, so WCAG 2.5.3 still holds. */
  const destination = `${citation.label} — open recipe`;
  return (
    <Link
      to={withReturnTo(`/recipes/${citation.knowledge_item_id}`, location)}
      aria-label={destination}
      title={destination}
      /* Marks this link as an INLINE target, exempt from the 44px floor under
         WCAG 2.2 SC 2.5.8's inline exception — it sits inside running answer
         prose, and growing it would turn a paragraph into a column of rows.
         The attribute exists so the tap-target sweep can express that
         exemption mechanically instead of a human waving at the output; see
         the plan's TASK-006. */
      data-citation-chip=""
      /* Contrast, remeasured against the re-skinned palette (2026-08-25) —
         the note here used to record a deferred shortfall, and the new values
         cleared it, so it would now read as a warning about a bug that no
         longer exists.

         REST (`bg-accent-fill text-accent`): #0b5ed7 on #eaf2fd is 5.18:1 in
         light. It was 3.01:1 under the apricot palette and was on the
         accessibility pass's list of seven light shortfalls; changing the
         accent from a mid-tone orange to a dark blue fixed it outright.
         HOVER (`bg-accent-strong text-fg-on-accent`): white on #0a4fb4 is
         7.53:1. `accent-strong` rather than `accent` is now a hover
         convention (fills darken) rather than a contrast workaround — plain
         `accent` would pass too, at 5.84:1. */
      className="mx-0.5 inline-block rounded-chip bg-accent-fill px-[7px] py-[2px] align-[2px] text-[12px] font-medium text-accent transition-colors hover:bg-accent-strong hover:text-fg-on-accent"
    >
      {citation.label}
    </Link>
  );
}

function Segments({
  segments,
  map,
}: {
  segments: InlineSegment[];
  map: CitationMap;
}) {
  return (
    <>
      {segments.map((segment, i) => {
        const key = `${segment.kind}-${i}`;
        if (segment.kind === "text") {
          return <Fragment key={key}>{segment.value}</Fragment>;
        }
        if (segment.kind === "bold") {
          return <strong key={key}>{segment.value}</strong>;
        }
        if (segment.kind === "italic") {
          return <em key={key}>{segment.value}</em>;
        }
        const citation = map.get(segment.id);
        /* Unresolvable ids degrade silently. */
        return citation ? <Chip key={key} citation={citation} /> : null;
      })}
    </>
  );
}

/** answer.text rendered with inline cite substitution. */
export function AnswerText({ text, map }: { text: string; map: CitationMap }) {
  const blocks = parseAnswerText(text);
  const rendered: React.ReactNode[] = [];
  let listBuffer: AnswerBlock[] = [];

  /* One run of consecutive items becomes one list. The parser reports
     whether each item was numbered or bulleted in the source, so a run flushes
     when that flips too — otherwise a bulleted item swept into an <ol> would
     be silently renumbered, which is a list that lies about its own source. */
  const flushList = () => {
    if (listBuffer.length === 0) {
      return;
    }
    const ordered = listBuffer[0]?.ordered === true;
    const items = listBuffer.map((item, i) => (
      <li
        // biome-ignore lint/suspicious/noArrayIndexKey: static parse result
        key={i}
      >
        <Segments segments={item.segments} map={map} />
      </li>
    ));
    const className = `mt-[0.8em] space-y-[0.5em] pl-6 first:mt-0 ${
      ordered ? "list-decimal" : "list-disc"
    }`;
    rendered.push(
      ordered ? (
        <ol key={`ol-${rendered.length}`} className={className}>
          {items}
        </ol>
      ) : (
        <ul key={`ul-${rendered.length}`} className={className}>
          {items}
        </ul>
      ),
    );
    listBuffer = [];
  };

  for (const block of blocks) {
    if (block.kind === "li") {
      if (listBuffer[0] && listBuffer[0].ordered !== block.ordered) {
        flushList();
      }
      listBuffer.push(block);
    } else {
      flushList();
      rendered.push(
        <p key={`p-${rendered.length}`} className="mt-[0.8em] first:mt-0">
          <Segments segments={block.segments} map={map} />
        </p>,
      );
    }
  }
  flushList();

  return (
    /* Answer prose: 15px on the body stack, one step up in leading from the
       chrome around it. The old 19.5px display serif made a generated answer
       look like an essay; the target reads its answers at body size and lets
       the whitespace do the separating. */
    <div className="text-[15px] leading-[1.7] text-fg">{rendered}</div>
  );
}

/** Trailing "Cited pages" row: every citations[] entry not already inline,
    deduped by citation_id. Sourced from citations[] (the union the backend
    builds), never answer.citations — picks can cite ids the prose doesn't. */
export function TrailingChips({
  citations,
  inlineIds,
}: {
  citations: AnswerCitation[];
  inlineIds: string[];
}) {
  const seen = new Set<string>();
  const remaining = citations.filter((c) => {
    if (inlineIds.includes(c.citation_id) || seen.has(c.citation_id)) {
      return false;
    }
    seen.add(c.citation_id);
    return true;
  });
  if (remaining.length === 0) {
    return null;
  }
  return (
    /* Sentence case. "CITED PAGES" was the last small-caps label left in the
       answer surface, and there is no small caps anywhere in the target. */
    <p className="mt-5 text-[13px] text-fg-subtle">
      Cited pages{" "}
      {remaining.map((citation) => (
        <Chip key={citation.citation_id} citation={citation} />
      ))}
    </p>
  );
}
