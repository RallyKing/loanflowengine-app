/**
 * Shared multi-contact assignment ids for pipeline schedule blocks
 * (Schedule of REO, Schedule of Business Debt, …).
 */

export type ScheduleBlockMeta = {
  assignedContactIds?: string[];
};

export function normalizeContactIdList(
  ids: unknown,
): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizeScheduleBlockMeta(
  raw: unknown,
): ScheduleBlockMeta {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { assignedContactIds: [] };
  }
  const rec = raw as { assignedContactIds?: unknown };
  return {
    assignedContactIds: normalizeContactIdList(rec.assignedContactIds),
  };
}

export function mergeScheduleBlockAssignees(input: {
  targetMeta?: ScheduleBlockMeta | null;
  incomingMeta?: ScheduleBlockMeta | null;
  copyBlockAssignees: boolean;
}): ScheduleBlockMeta {
  const targetIds = normalizeContactIdList(input.targetMeta?.assignedContactIds);
  if (!input.copyBlockAssignees) return { assignedContactIds: targetIds };
  const incomingIds = normalizeContactIdList(
    input.incomingMeta?.assignedContactIds,
  );
  return {
    assignedContactIds: normalizeContactIdList([...targetIds, ...incomingIds]),
  };
}

export function newScheduleRowId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
