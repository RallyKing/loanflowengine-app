/**
 * Monotonic "last touched" time for an intake-shaped snapshot.
 * Uses `updatedAt` when set, else Convex `_creationTime`.
 * Does **not** use `pipeline.updatedAt` — that bumps for pipeline-only edits
 * (stage, notes, …) and must not make stale embedded `dealData` appear newer
 * than a linked `intakeSheets` row that actually holds the latest deal fields.
 */
function effectiveIntakeSnapshotTime(
  doc: { updatedAt?: number; _creationTime?: number } | null,
): number | null {
  if (!doc) return null;
  if (typeof doc.updatedAt === "number" && Number.isFinite(doc.updatedAt)) {
    return doc.updatedAt;
  }
  if (
    typeof doc._creationTime === "number" &&
    Number.isFinite(doc._creationTime)
  ) {
    return doc._creationTime;
  }
  return null;
}

/**
 * When a pipeline file has both embedded `dealData` and a linked
 * `intakeSheets` row, pick the snapshot that was updated most recently **on
 * that document** (`updatedAt`, else `_creationTime`). Avoids stale funding
 * when one side was saved without the other being mirrored yet, and avoids
 * treating unrelated pipeline row updates as proof that embedded deal JSON
 * is fresh.
 *
 * `pipelineUpdatedAt` is kept for API stability; it is **not** used when both
 * snapshots exist (see `effectiveIntakeSnapshotTime`).
 */
export function pickIntakeShapedPreviewPayload<
  T extends { updatedAt?: number; _creationTime?: number },
>(embedded: T | null, linked: T | null, pipelineUpdatedAt: number): T | null {
  void pipelineUpdatedAt;
  if (embedded != null && linked != null) {
    const te = effectiveIntakeSnapshotTime(embedded);
    const tl = effectiveIntakeSnapshotTime(linked);
    const e = te ?? 0;
    const l = tl ?? 0;
    if (l > e) return linked;
    if (e > l) return embedded;
    /** Same instant (common right after `patchDeal`): DB row is canonical. */
    return linked;
  }
  if (embedded != null) return embedded;
  if (linked != null) return linked;
  return null;
}
