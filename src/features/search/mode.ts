import type { SearchMode } from "../../api/search";

/** The three retrieval modes, in chip order. */
export const MODES = ["hybrid", "keyword", "vector"] as const;

/** Anything else — a hand-edited URL, a corrupt storage record — reads as the
    default rather than reaching the API. */
export function parseMode(raw: string | null | undefined): SearchMode {
  return MODES.includes(raw as SearchMode) ? (raw as SearchMode) : "hybrid";
}
