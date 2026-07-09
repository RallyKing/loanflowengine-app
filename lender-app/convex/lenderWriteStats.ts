import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const SINGLETON_KEY = "singleton" as const;

export function isLenderIncomplete(l: {
  programs: string;
  programList?: Doc<"lenders">["programList"];
  primaryNiche: string;
}): boolean {
  const hasPrograms =
    (l.programs && l.programs.trim().length > 0) ||
    (Array.isArray(l.programList) && l.programList.length > 0);
  const hasNiche = l.primaryNiche && l.primaryNiche.trim().length > 0;
  return !(hasPrograms && hasNiche);
}

export function computeStatsFromRows(rows: Doc<"lenders">[]) {
  const byEntity: Record<string, number> = {};
  const bySection: Record<string, number> = {};
  let incompleteCount = 0;
  for (const r of rows) {
    byEntity[r.entityType] = (byEntity[r.entityType] ?? 0) + 1;
    bySection[r.section] = (bySection[r.section] ?? 0) + 1;
    if (isLenderIncomplete(r)) incompleteCount += 1;
  }
  return {
    total: rows.length,
    byEntity,
    bySection,
    incompleteCount,
  };
}

export async function getLenderStatsSingleton(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"lenderStats"> | null> {
  return await ctx.db
    .query("lenderStats")
    .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
    .first();
}

export async function ensureStatsFromScan(ctx: MutationCtx) {
  const existing = await getLenderStatsSingleton(ctx);
  if (existing) return existing;
  const rows = await ctx.db.query("lenders").collect();
  const c = computeStatsFromRows(rows);
  const id = await ctx.db.insert("lenderStats", {
    key: SINGLETON_KEY,
    total: c.total,
    byEntity: c.byEntity,
    bySection: c.bySection,
    incompleteCount: c.incompleteCount,
  });
  return (await ctx.db.get(id))!;
}

function decMap(m: Record<string, number>, k: string) {
  m[k] = (m[k] ?? 0) - 1;
  if (m[k]! <= 0) delete m[k];
}
function incMap(m: Record<string, number>, k: string) {
  m[k] = (m[k] ?? 0) + 1;
}

function statEqual(
  a: Doc<"lenders">,
  b: Doc<"lenders">
): boolean {
  return (
    a.entityType === b.entityType &&
    a.section === b.section &&
    isLenderIncomplete(a) === isLenderIncomplete(b)
  );
}

/**
 * After any insert / update / delete on `lenders`, keep `lenderStats` in sync.
 * Call with (null, doc) after insert, (doc, null) after delete, (before, after) after update.
 */
export async function applyLenderWrite(
  ctx: MutationCtx,
  before: Doc<"lenders"> | null,
  after: Doc<"lenders"> | null
) {
  if (before && after && before._id !== after._id) {
    throw new Error("applyLenderWrite: before/after id mismatch");
  }

  await ensureStatsFromScan(ctx);
  const s = (await getLenderStatsSingleton(ctx))!;

  if (!before && after) {
    const patch: Partial<Doc<"lenderStats">> = {
      total: s.total + 1,
      byEntity: { ...s.byEntity },
      bySection: { ...s.bySection },
      incompleteCount: s.incompleteCount,
    };
    incMap(patch.byEntity!, after.entityType);
    incMap(patch.bySection!, after.section);
    if (isLenderIncomplete(after)) patch.incompleteCount! += 1;
    await ctx.db.patch(s._id, patch);
    return;
  }

  if (before && !after) {
    const patch: Partial<Doc<"lenderStats">> = {
      total: Math.max(0, s.total - 1),
      byEntity: { ...s.byEntity },
      bySection: { ...s.bySection },
      incompleteCount: s.incompleteCount,
    };
    decMap(patch.byEntity!, before.entityType);
    decMap(patch.bySection!, before.section);
    if (isLenderIncomplete(before)) {
      patch.incompleteCount = Math.max(0, s.incompleteCount - 1);
    }
    await ctx.db.patch(s._id, patch);
    return;
  }

  if (before && after) {
    if (statEqual(before, after)) return;
    const patch: Partial<Doc<"lenderStats">> = {
      byEntity: { ...s.byEntity },
      bySection: { ...s.bySection },
      incompleteCount: s.incompleteCount,
    };
    if (before.entityType !== after.entityType) {
      decMap(patch.byEntity!, before.entityType);
      incMap(patch.byEntity!, after.entityType);
    }
    if (before.section !== after.section) {
      decMap(patch.bySection!, before.section);
      incMap(patch.bySection!, after.section);
    }
    const bi = isLenderIncomplete(before);
    const ai = isLenderIncomplete(after);
    if (bi && !ai) {
      patch.incompleteCount = Math.max(0, s.incompleteCount - 1);
    } else if (!bi && ai) {
      patch.incompleteCount = s.incompleteCount + 1;
    }
    await ctx.db.patch(s._id, patch);
  }
}

export async function listIncompleteCore(
  ctx: QueryCtx,
  limit: number | undefined
): Promise<{ total: number; ids: Id<"lenders">[] }> {
  const cap = Math.min(limit ?? 50, 2000);
  const s = await getLenderStatsSingleton(ctx);
  if (s) {
    const indexed = await ctx.db
      .query("lenders")
      .withIndex("by_incomplete_enriched", (q) => q.eq("incompleteData", true))
      .order("asc")
      .take(cap);
    if (s.incompleteCount === 0 || indexed.length > 0) {
      return { total: s.incompleteCount, ids: indexed.map((r) => r._id) };
    }
  }

  const all = await ctx.db.query("lenders").collect();
  const incomplete = all.filter((r) => isLenderIncomplete(r));
  incomplete.sort(
    (a, b) => (a.enrichedAt ?? 0) - (b.enrichedAt ?? 0)
  );
  return {
    total: incomplete.length,
    ids: incomplete.slice(0, cap).map((r) => r._id),
  };
}

export function formatStatsPublic(s: Doc<"lenderStats">) {
  return {
    total: s.total,
    byEntity: Object.entries(s.byEntity).sort((a, b) => b[1] - a[1]),
    bySection: Object.entries(s.bySection).sort((a, b) => b[1] - a[1]),
    incompleteCount: s.incompleteCount,
  };
}

export function formatStatsFromRows(rows: Doc<"lenders">[]) {
  const c = computeStatsFromRows(rows);
  return {
    total: c.total,
    byEntity: Object.entries(c.byEntity).sort((a, b) => b[1] - a[1]),
    bySection: Object.entries(c.bySection).sort((a, b) => b[1] - a[1]),
    incompleteCount: c.incompleteCount,
  };
}
