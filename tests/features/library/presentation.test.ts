import {
  isReadyIsh,
  spineAccent,
  statusPill,
} from "../../../src/features/library/presentation";
import { relativeTime } from "../../../src/features/library/relativeTime";

describe("statusPill", () => {
  it("maps ready to an ok 'Ready'", () => {
    expect(statusPill("ready", 1)).toEqual({ tone: "ok", label: "Ready" });
  });

  it("maps needs_review to a warn pill carrying the count", () => {
    expect(statusPill("needs_review", 14)).toEqual({
      tone: "warn",
      label: "14 need review",
    });
  });

  it("agrees the verb with a count of one", () => {
    expect(statusPill("needs_review", 1)).toEqual({
      tone: "warn",
      label: "1 needs review",
    });
  });

  it("drops the number, not the pill, while the count is unknown", () => {
    expect(statusPill("needs_review", undefined)).toEqual({
      tone: "warn",
      label: "Needs review",
    });
  });

  it("maps failed to a failed 'Failed'", () => {
    expect(statusPill("failed", undefined)).toEqual({
      tone: "failed",
      label: "Failed",
    });
  });

  it("maps every non-terminal status to a working 'Processing'", () => {
    for (const status of [
      "queued",
      "extracting_text",
      "creating_source_spans",
      "extracting_items",
      "validating_items",
      "creating_chunks",
      "embedding_chunks",
      "indexing",
    ] as const) {
      expect(statusPill(status, undefined)).toEqual({
        tone: "working",
        label: "Processing",
      });
    }
  });
});

describe("spineAccent", () => {
  it("overrides with apricot while working and danger when failed", () => {
    expect(spineAccent("queued", "any-id")).toBe("bg-apricot");
    expect(spineAccent("embedding_chunks", "any-id")).toBe("bg-apricot");
    expect(spineAccent("failed", "any-id")).toBe("bg-danger");
  });

  it("picks a stable accent from the rotation by document id", () => {
    const first = spineAccent("ready", "book-one-pan");
    expect(first).toBe(spineAccent("ready", "book-one-pan"));
    expect(["bg-sage", "bg-terra-ink", "bg-butter-ink"]).toContain(first);
  });
});

describe("isReadyIsh", () => {
  it("is true only for ready and needs_review", () => {
    expect(isReadyIsh("ready")).toBe(true);
    expect(isReadyIsh("needs_review")).toBe(true);
    expect(isReadyIsh("failed")).toBe(false);
    expect(isReadyIsh("queued")).toBe(false);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-07-31T10:00:00Z");

  it.each([
    ["2026-07-31T09:59:50Z", "just now"],
    ["2026-07-31T09:56:00Z", "4 minutes ago"],
    ["2026-07-31T09:00:00Z", "1 hour ago"],
    ["2026-07-31T03:00:00Z", "7 hours ago"],
    ["2026-07-30T09:00:00Z", "yesterday"],
    ["2026-07-27T10:00:00Z", "4 days ago"],
    ["2026-05-01T10:00:00Z", "3 months ago"],
  ])("renders %s as '%s'", (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });
});
