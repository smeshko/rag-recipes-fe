import {
  type AnswerBlock,
  inlineCiteOccurrences,
  parseAnswerText,
} from "../../src/features/search/answerText";

/* The answer-text parser, block shapes and inline marks.
 *
 * This file exists because of a bug that every other test missed: the fixtures
 * spelled their numbered lists with BLANK LINES between items, the live model
 * spells them with single newlines, and the parser only handled the first. All
 * four items rendered as one list item with a literal "2." "3." "4." inside
 * it. Both spellings are legal Markdown, so both are pinned here. */

/** Flattens a block to `kind:text` so a whole parse reads as one assertion. */
function shape(blocks: AnswerBlock[]): string[] {
  return blocks.map((block) => {
    const text = block.segments
      .map((s) => (s.kind === "cite" ? `<${s.id}>` : s.value))
      .join("");
    const kind =
      block.kind === "li" ? (block.ordered ? "ol" : "ul") : block.kind;
    return `${kind}:${text}`;
  });
}

describe("block shapes", () => {
  it("splits a numbered list written with blank lines", () => {
    expect(
      shape(parseAnswerText("Intro:\n\n1. First\n\n2. Second\n\n3. Third")),
    ).toEqual(["p:Intro:", "ol:First", "ol:Second", "ol:Third"]);
  });

  /* THE REGRESSION. Same list, the spelling the model actually uses. */
  it("splits a numbered list written with single newlines", () => {
    expect(
      shape(parseAnswerText("Intro:\n1. First\n2. Second\n3. Third")),
    ).toEqual(["p:Intro:", "ol:First", "ol:Second", "ol:Third"]);
  });

  it("accepts `1)` as well as `1.`", () => {
    expect(shape(parseAnswerText("1) First\n2) Second"))).toEqual([
      "ol:First",
      "ol:Second",
    ]);
  });

  it("reads dash and star bullets as an unordered list", () => {
    expect(shape(parseAnswerText("- One\n- Two"))).toEqual([
      "ul:One",
      "ul:Two",
    ]);
    expect(shape(parseAnswerText("* One\n* Two"))).toEqual([
      "ul:One",
      "ul:Two",
    ]);
  });

  /* A soft-wrapped paragraph is ONE paragraph — rejoined with a space, not
     split into a line each, and not glued together without one. */
  it("rejoins a paragraph wrapped across lines", () => {
    expect(shape(parseAnswerText("One line\nand its continuation."))).toEqual([
      "p:One line and its continuation.",
    ]);
  });

  it("ends a paragraph at a list item with no blank line between", () => {
    expect(shape(parseAnswerText("Lead-in:\n1. First"))).toEqual([
      "p:Lead-in:",
      "ol:First",
    ]);
  });

  it("ignores blank and whitespace-only lines", () => {
    expect(shape(parseAnswerText("A\n\n   \n\nB"))).toEqual(["p:A", "p:B"]);
  });
});

describe("inline marks", () => {
  it("renders **bold** and *italic* as their own segments", () => {
    const [block] = parseAnswerText("Plain **strong** and *stressed* words.");
    expect(block?.segments).toEqual([
      { kind: "text", value: "Plain " },
      { kind: "bold", value: "strong" },
      { kind: "text", value: " and " },
      { kind: "italic", value: "stressed" },
      { kind: "text", value: " words." },
    ]);
  });

  /* Alternation order: the italic arm must not claim the opening `*` of a
     bold run and strand its partner. */
  it("prefers bold over italic on a doubled marker", () => {
    const [block] = parseAnswerText("**Paleo for Beginners**");
    expect(block?.segments).toEqual([
      { kind: "bold", value: "Paleo for Beginners" },
    ]);
  });

  it("italicises a book title without printing its asterisks", () => {
    const [block] = parseAnswerText("From *Paleo for Beginners*, p. 54.");
    expect(
      shape(parseAnswerText("From *Paleo for Beginners*, p. 54.")),
    ).toEqual(["p:From Paleo for Beginners, p. 54."]);
    expect(block?.segments.some((s) => s.kind === "italic")).toBe(true);
  });

  /* A bullet marker is `*` followed by a space; an italic marker never is.
     Without that rule a list would become a paragraph of stray emphasis. */
  it("does not read a bullet marker as emphasis", () => {
    expect(shape(parseAnswerText("* One\n* Two"))).toEqual([
      "ul:One",
      "ul:Two",
    ]);
  });

  /* Deliberately literal: mangling arithmetic is worse than showing a lone
     marker, and an unclosed emphasis is rarer than "2 * 3" is real. */
  it("leaves a lone asterisk in the prose", () => {
    expect(shape(parseAnswerText("Halve it: 2 * 3 servings."))).toEqual([
      "p:Halve it: 2 * 3 servings.",
    ]);
  });

  it("drops the markers of an unclosed bold", () => {
    expect(shape(parseAnswerText("An **unclosed run"))).toEqual([
      "p:An unclosed run",
    ]);
  });
});

describe("citations", () => {
  it("substitutes bracketed, parenthesised and bare markers alike", () => {
    expect(inlineCiteOccurrences("A [cite_1] B (cite_2) C cite_3")).toEqual([
      "cite_1",
      "cite_2",
      "cite_3",
    ]);
  });

  it("consumes the delimiter so no orphan bracket is left behind", () => {
    expect(shape(parseAnswerText("Serve warm [cite_1]."))).toEqual([
      "p:Serve warm<cite_1>.",
    ]);
  });

  /* Counted per OCCURRENCE, not per distinct id: the renderer emits one chip
     per marker, so a page cited twice must count twice. */
  it("counts a repeated citation once per occurrence", () => {
    expect(inlineCiteOccurrences("A [cite_1] and again [cite_1]")).toEqual([
      "cite_1",
      "cite_1",
    ]);
  });

  it("finds citations inside list items written with single newlines", () => {
    expect(
      inlineCiteOccurrences("1. First [cite_1]\n2. Second [cite_2]"),
    ).toEqual(["cite_1", "cite_2"]);
  });
});
