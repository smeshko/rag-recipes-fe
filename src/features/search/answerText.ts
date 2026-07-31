/* Pure parser for answer.text — lightweight Markdown, verified live. Exactly
   three constructs (no Markdown library, no client-side invention — the
   bolding comes from the API): \n\n paragraph splits, **bold**, and a
   leading "N. " marking an ordered-list item. Inline [cite_N] / (cite_N)
   tokens become cite segments with their enclosing delimiter consumed —
   a bare /cite_\d+/ would leave orphan brackets beside every chip. */

export type InlineSegment =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "cite"; id: string };

export interface AnswerBlock {
  kind: "p" | "li";
  segments: InlineSegment[];
}

const INLINE = /\*\*(.+?)\*\*|\s*[[(](cite_\d+)[\])]/g;

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) {
      segments.push({ kind: "text", value: text.slice(last, match.index) });
    }
    if (match[1] !== undefined) {
      segments.push({ kind: "bold", value: match[1] });
    } else if (match[2] !== undefined) {
      segments.push({ kind: "cite", id: match[2] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ kind: "text", value: text.slice(last) });
  }
  return segments;
}

export function parseAnswerText(text: string): AnswerBlock[] {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const listMatch = block.match(/^\d+\.\s+/);
      return {
        kind: listMatch ? ("li" as const) : ("p" as const),
        segments: parseInline(
          listMatch ? block.slice(listMatch[0].length) : block,
        ),
      };
    });
}

/** Distinct cite ids that appear inline in the text, in order. */
export function inlineCiteIds(text: string): string[] {
  const ids: string[] = [];
  for (const block of parseAnswerText(text)) {
    for (const segment of block.segments) {
      if (segment.kind === "cite" && !ids.includes(segment.id)) {
        ids.push(segment.id);
      }
    }
  }
  return ids;
}
