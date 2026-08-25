import type { ReactNode } from "react";

/**
 * A `role="status"` inline note for outcomes that are state reports, not
 * errors — never danger styling. Extracted here (TASK-003); phase 3.2's
 * Dropzone keeps its own inline notice and may adopt this later.
 */
export function CalmNotice({ children }: { children: ReactNode }) {
  return (
    <span role="status" className="mt-2 block text-[13px] text-fg-muted">
      {children}
    </span>
  );
}
