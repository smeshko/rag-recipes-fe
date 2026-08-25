/**
 * Which statuses `/recipes/:id/edit` will open a form for — the frontend's
 * copy of the backend's `_EDITABLE_STATUSES` guard on
 * `PATCH /knowledge-items/{id}`.
 *
 * Deliberately in one module rather than inlined at its two call sites: the
 * page's gate ("may this be edited at all") and the form's conflict surface
 * ("has someone changed this underneath me") must answer from the SAME set.
 * Split, a status that is editable but not conflict-free — which is exactly
 * what `ready` became — renders a form with a "someone beat you to it" banner
 * over it.
 *
 * `indexing` is absent on purpose. It is where a saved `ready` item lands
 * while the worker re-embeds it: transient, and the backend 409s, so the
 * honest answer is "not right now" rather than a form whose save will bounce.
 */
export function isEditableStatus(status: string): boolean {
  return status === "needs_review" || status === "ready";
}

/** A `ready` edit is the expensive one — it costs the item its place in search
    until the re-index lands. The page and the form both need to say so. */
export function isShelved(status: string): boolean {
  return status === "ready";
}
