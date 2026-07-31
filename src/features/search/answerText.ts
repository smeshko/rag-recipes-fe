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

/* Delimiters are OPTIONAL (D2's correction spells the shape out): the marker
   format is uncontracted, so a bare `cite_3` must substitute too — otherwise
   it stays visible in the prose while the same source also appears in the
   trailing row, which is broken and duplicated provenance. When a delimiter
   is present it is consumed along with the leading space, so no orphan
   bracket is left beside the chip. */
const INLINE = /\*\*(.+?)\*\*|\s*[[(]?(cite_\d+)[\])]?/g;

/* Any ** reaching a text segment is unmatched by construction — the balanced
   form was consumed by INLINE above. Drop it rather than print it: a model
   answer truncated mid-bold is a real failure mode, and literal asterisks in
   the prose are the one thing the parser exists to prevent. */
function pushText(segments: InlineSegment[], value: string) {
  const cleaned = value.replace(/\*\*/g, "");
  if (cleaned !== "") {
    segments.push({ kind: "text", value: cleaned });
  }
}

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) {
      pushText(segments, text.slice(last, match.index));
    }
    if (match[1] !== undefined) {
      segments.push({ kind: "bold", value: match[1] });
    } else if (match[2] !== undefined) {
      segments.push({ kind: "cite", id: match[2] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    pushText(segments, text.slice(last));
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

/** Cite ids inline in the text, in order, one entry per occurrence — the
    chips actually rendered, so a count taken from this matches the DOM. */
export function inlineCiteOccurrences(text: string): string[] {
  const ids: string[] = [];
  for (const block of parseAnswerText(text)) {
    for (const segment of block.segments) {
      if (segment.kind === "cite") {
        ids.push(segment.id);
      }
    }
  }
  return ids;
}

/** Distinct cite ids that appear inline in the text, in order. */
export function inlineCiteIds(text: string): string[] {
  return [...new Set(inlineCiteOccurrences(text))];
}
