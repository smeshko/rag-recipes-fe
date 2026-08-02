import { stepLines } from "../../src/features/recipe/stepLines";

/* The unit describe `stepLines` deserves and cannot get in panels.test.tsx —
   that file is frozen as the proof the 5.3 extraction changed no rendered
   output, so the direct coverage of the ordering rules lives here. A mirror of
   its `describe("ingredientLines")` block, one case per rule. */

describe("stepLines", () => {
  it("drops textless rows before numbering", () => {
    expect(
      stepLines({
        steps: [
          { text: "Warm the pan.", step_number: null },
          { text: null, step_number: null },
          { text: "Serve.", step_number: null },
        ],
      }),
    ).toEqual([
      { number: 1, text: "Warm the pan." },
      { number: 2, text: "Serve." },
    ]);
  });

  it("keeps arrival order when the numbering is only partial", () => {
    /* Sorting on `step_number ?? 0` would drag the unnumbered step to the
       front and change the cooking order. */
    expect(
      stepLines({
        steps: [
          { text: "Warm the pan.", step_number: 1 },
          { text: "Add the eggs.", step_number: null },
          { text: "Serve.", step_number: 2 },
        ],
      }),
    ).toEqual([
      { number: 1, text: "Warm the pan." },
      { number: 2, text: "Add the eggs." },
      { number: 3, text: "Serve." },
    ]);
  });

  it("ignores non-positive ordinals rather than ordering by them", () => {
    expect(
      stepLines({
        steps: [
          { text: "Warm the pan.", step_number: -1 },
          { text: "Add the eggs.", step_number: 2 },
          { text: "Serve.", step_number: 1 },
        ],
      }),
    ).toEqual([
      { number: 1, text: "Warm the pan." },
      { number: 2, text: "Add the eggs." },
      { number: 3, text: "Serve." },
    ]);
  });

  it("repeats are not trusted either", () => {
    expect(
      stepLines({
        steps: [
          { text: "Warm the pan.", step_number: 1 },
          { text: "Serve.", step_number: 1 },
        ],
      }),
    ).toEqual([
      { number: 1, text: "Warm the pan." },
      { number: 2, text: "Serve." },
    ]);
  });

  it("sorts by a wholly trusted numbering and preserves its gaps", () => {
    /* [1, 2, 4] most likely lost step 3 in extraction; renumbering to 1-2-3
       would erase the only evidence of the omission. */
    expect(
      stepLines({
        steps: [
          { text: "Serve.", step_number: 4 },
          { text: "Warm the pan.", step_number: 1 },
          { text: "Add the eggs.", step_number: 2 },
        ],
      }),
    ).toEqual([
      { number: 1, text: "Warm the pan." },
      { number: 2, text: "Add the eggs." },
      { number: 4, text: "Serve." },
    ]);
  });

  it("resolves empty when there are no steps at all", () => {
    expect(stepLines({})).toEqual([]);
  });
});
