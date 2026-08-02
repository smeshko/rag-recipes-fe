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
      className="mx-0.5 inline-block rounded-chip bg-apricot-soft px-[7px] py-[2px] align-[2px] font-body text-[11.5px] font-bold text-apricot transition-colors hover:bg-apricot hover:text-white"
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

  const flushList = () => {
    if (listBuffer.length > 0) {
      rendered.push(
        <ol
          key={`ol-${rendered.length}`}
          className="mt-[0.8em] list-decimal space-y-[0.8em] pl-6 first:mt-0"
        >
          {listBuffer.map((item, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: static parse result
              key={i}
            >
              <Segments segments={item.segments} map={map} />
            </li>
          ))}
        </ol>,
      );
      listBuffer = [];
    }
  };

  for (const block of blocks) {
    if (block.kind === "li") {
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
    <div className="font-display text-[19.5px] leading-[1.65] text-ink">
      {rendered}
    </div>
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
    <p className="mt-5 text-[12px] font-bold tracking-[0.06em] text-ink-faint uppercase">
      Cited pages{" "}
      {remaining.map((citation) => (
        <Chip key={citation.citation_id} citation={citation} />
      ))}
    </p>
  );
}
