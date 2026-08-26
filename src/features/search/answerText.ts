/* Pure parser for answer.text — the lightweight Markdown the backend's answer
 * prompt DECLARES (ARCHITECTURE.md "Answer text contract"): GitHub-flavoured
 * Markdown with citations inline as `[cite_N]`. The shape was first observed
 * live and then written into the versioned prompt, so this parser targets a
 * stated contract rather than one model's habits; a prompt-version change
 * that alters the format changes this file and tests/msw/answers.ts with it.
 *
 * It stays hand-rolled rather than pulling in a Markdown library: the output
 * has to interleave citation chips that no library knows about, and rendering
 * arbitrary Markdown from an LLM into a page is a bigger surface than this
 * needs. But "minimal" turned out to mean "wrong on valid input", so the scope
 * is now:
 *
 *   blocks      blank lines separate paragraphs; a paragraph may be soft-wrapped
 *               across several lines and is rejoined with a space
 *   lists       a LINE beginning `1. `, `1) `, `- ` or `* ` is a list item —
 *               ordered items render <ol>, bullets <ul>
 *   inline      **bold**, *italic*, and [cite_N] / (cite_N) / bare cite_N
 *
 * THE BUG THIS FIXES, because it is the kind that looks like a model problem
 * and is not: blocks used to be split on `/\n\n+/` alone, and an item was only
 * recognised when a whole BLOCK began with `N. `. Markdown lists are far more
 * often written with single newlines between items, and the model writes them
 * that way. Those four items arrived as one block, matched `^1. ` exactly
 * once, and rendered as a single list item with a literal "2." "3." "4."
 * embedded in its text. The fixture used the blank-line spelling, so every
 * test passed. Splitting per LINE is what makes both spellings render.
 *
 * Italics are new for the same reason: `*Paleo for Beginners*` printed its
 * asterisks. Only the paired form is handled — a lone `*` stays literal text
 * rather than being stripped, because "2 * 3" is prose and mangling it would
 * be worse than showing it. */

export type InlineSegment =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "cite"; id: string };

export interface AnswerBlock {
  kind: "p" | "li";
  /** `li` only: numbered in the source (<ol>) rather than bulleted (<ul>). */
  ordered?: boolean;
  segments: InlineSegment[];
}

/* Alternation order is load-bearing: `**bold**` has to be tried before
   `*italic*`, or the italic arm would claim the first `*` of every bold run
   and leave its partner behind as text.

   The italic arm refuses a marker followed by whitespace (`*(?!\s)`) and
   forbids `*` or a newline inside, so a bullet line's `* ` marker and a stray
   multiplication sign are both left alone.

   Delimiters around a cite are OPTIONAL (D2's correction spells the shape
   out): the marker format is uncontracted, so a bare `cite_3` must substitute
   too — otherwise it stays visible in the prose while the same source also
   appears in the trailing row, which is broken and duplicated provenance.
   When a delimiter is present it is consumed along with the leading space, so
   no orphan bracket is left beside the chip. */
const INLINE = /\*\*(.+?)\*\*|\*(?!\s)([^*\n]+?)\*|\s*[[(]?(cite_\d+)[\])]?/g;

/* A LINE that opens a list item: `1.`, `1)`, `-` or `*`, then whitespace.
   The trailing `\s+` is what keeps `*italic*` from reading as a bullet. */
const LIST_ITEM = /^(?:(\d+)[.)]|[-*])\s+(.*)$/;

/* Any ** reaching a text segment is unmatched by construction — the balanced
   form was consumed by INLINE above. Drop it rather than print it: a model
   answer truncated mid-bold is a real failure mode, and literal asterisks in
   the prose are the one thing the parser exists to prevent. Single `*` is
   deliberately NOT stripped here; see the header note. */
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
      segments.push({ kind: "italic", value: match[2] });
    } else if (match[3] !== undefined) {
      segments.push({ kind: "cite", id: match[3] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    pushText(segments, text.slice(last));
  }
  return segments;
}

export function parseAnswerText(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  /* Soft-wrapped paragraph lines accumulate here and are joined with a space
     when something ends the paragraph — a blank line, a list item, or the end
     of the text. */
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", segments: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      flushParagraph();
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      /* A list item ends whatever paragraph preceded it, even with no blank
         line between them — which is exactly the shape that used to swallow
         the whole list into one paragraph. */
      flushParagraph();
      blocks.push({
        kind: "li",
        ordered: item[1] !== undefined,
        segments: parseInline(item[2] ?? ""),
      });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();

  return blocks;
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
