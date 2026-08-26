import { greetingFor } from "../../src/features/search/greeting";

/* The greeting on the composer. It was a hard-coded "Good morning", which is
   wrong two thirds of the day, so the boundaries are pinned here rather than
   left to be re-derived. Dates are built local-time (no Z), because the
   greeting reads the reader's own clock. */
function at(hour: number): Date {
  return new Date(2026, 7, 26, hour, 30);
}

describe("greetingFor", () => {
  it("names the part of the day the reader is in", () => {
    expect(greetingFor(at(8))).toBe("Good morning");
    expect(greetingFor(at(14))).toBe("Good afternoon");
    expect(greetingFor(at(21))).toBe("Good evening");
  });

  it("switches exactly on the hour, not inside it", () => {
    expect(greetingFor(new Date(2026, 7, 26, 11, 59))).toBe("Good morning");
    expect(greetingFor(new Date(2026, 7, 26, 12, 0))).toBe("Good afternoon");
    expect(greetingFor(new Date(2026, 7, 26, 17, 59))).toBe("Good afternoon");
    expect(greetingFor(new Date(2026, 7, 26, 18, 0))).toBe("Good evening");
  });

  /* The small hours are evening, not a fourth greeting: "Good night" is a
     farewell, and 03:00 is squarely still the previous evening's cooking. */
  it("keeps the small hours on the evening side", () => {
    expect(greetingFor(at(0))).toBe("Good evening");
    expect(greetingFor(at(4))).toBe("Good evening");
    expect(greetingFor(at(5))).toBe("Good morning");
  });
});
