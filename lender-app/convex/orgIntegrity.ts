import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { orgIntegrityFail, orgIntegrityTrace } from "./orgIntegrityTelemetry";

function assertOrgIntegrityAdmin(secret: string) {
  const expected = process.env.ORG_INTEGRITY_ADMIN_SECRET?.trim();
  if (!expected || secret !== expected) {
    orgIntegrityFail("orgIntegrity.unauthorized", {});
    throw new Error("Unauthorized integrity operation.");
  }
}

/**
 * Read-only report. Run from the Convex dashboard or CLI.
 */
export const validateOrganizationIntegrity = query({
  args: {
    adminSecret: v.string(),
    memberSample: v.optional(v.number()),
    rowSample: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertOrgIntegrityAdmin(args.adminSecret);
    const mCap = Math.min(Math.max(args.memberSample ?? 2000, 100), 20_000);
    const rCap = Math.min(Math.max(args.rowSample ?? 500, 50), 5000);

    const memberRows = await ctx.db.query("organizationMembers").take(mCap);
    const membersMissingOrg: Id<"organizationMembers">[] = [];
    const keyCounts = new Map<string, number>();
    for (const m of memberRows) {
      const org = await ctx.db.get(m.organizationId);
      if (!org) membersMissingOrg.push(m._id);
      const k = `${m.organizationId}|${m.userKey}`;
      keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
    }
    let duplicateMemberKeys = 0;
    for (const n of keyCounts.values()) {
      if (n > 1) duplicateMemberKeys++;
    }

    const scanTable = async (
      name: "pipeline" | "contacts" | "lenders" | "tasks",
    ): Promise<number> => {
      let dangling = 0;
      const rows = await ctx.db.query(name).order("desc").take(rCap);
      for (const row of rows) {
        const oid = row.organizationId as Id<"organizations"> | undefined;
        if (!oid) continue;
        const o = await ctx.db.get(oid);
        if (!o) dangling++;
      }
      return dangling;
    };

    const pipelineDanglingOrg = await scanTable("pipeline");
    const contactsDanglingOrg = await scanTable("contacts");
    const lendersDanglingOrg = await scanTable("lenders");
    const tasksDanglingOrg = await scanTable("tasks");

    orgIntegrityTrace("validateOrganizationIntegrity.done", {
      membersSampled: memberRows.length,
      membersMissingOrg: membersMissingOrg.length,
      duplicateMemberKeys,
    });

    return {
      sampledMembers: memberRows.length,
      membersMissingOrg,
      duplicateMemberKeys,
      danglingOrgRefs: {
        pipeline: pipelineDanglingOrg,
        contacts: contactsDanglingOrg,
        lenders: lendersDanglingOrg,
        tasks: tasksDanglingOrg,
      },
      note:
        "Counts are from sampled rows only. Raise memberSample/rowSample for deeper coverage.",
    };
  },
});

/** Keeps newest `organizationMembers` row per (organizationId, userKey). */
export const dedupeOrganizationMembers = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    assertOrgIntegrityAdmin(args.adminSecret);
    const all = await ctx.db.query("organizationMembers").collect();
    const byKey = new Map<string, typeof all>();
    for (const m of all) {
      const k = `${m.organizationId}|${m.userKey}`;
      let g = byKey.get(k);
      if (!g) {
        g = [];
        byKey.set(k, g);
      }
      g.push(m);
    }
    let wouldDelete = 0;
    let deleted = 0;
    for (const rows of byKey.values()) {
      if (rows.length <= 1) continue;
      rows.sort((a, b) => a._creationTime - b._creationTime);
      const drop = rows.slice(0, -1);
      wouldDelete += drop.length;
      if (args.dryRun) continue;
      for (const d of drop) {
        await ctx.db.delete(d._id);
        deleted++;
      }
    }
    return { dryRun: args.dryRun, wouldDelete, deleted };
  },
});

type OptionalOrgTable =
  | "pipeline"
  | "contacts"
  | "lenders"
  | "tasks"
  | "libraryDocuments";

async function clearOptionalOrgRefs(
  ctx: MutationCtx,
  table: OptionalOrgTable,
  dryRun: boolean,
  budget: { remaining: number },
  detail: string[],
) {
  const rows = await ctx.db.query(table).order("desc").take(800);
  for (const row of rows) {
    if (budget.remaining <= 0) return;
    const oid = row.organizationId as Id<"organizations"> | undefined;
    if (!oid) continue;
    const o = await ctx.db.get(oid);
    if (o) continue;
    if (dryRun) {
      budget.remaining--;
      detail.push(`would clear ${table} ${row._id}`);
    } else {
      await ctx.db.patch(row._id, { organizationId: undefined });
      budget.remaining--;
    }
  }
}

/**
 * Deletes orphan membership rows; clears optional `organizationId` on sampled
 * tenant rows when the org doc is gone.
 */
export const repairOrganizationReferences = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.boolean(),
    maxPatches: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertOrgIntegrityAdmin(args.adminSecret);
    const max = Math.min(Math.max(args.maxPatches ?? 200, 1), 5000);
    const budget = { remaining: max };
    const detail: string[] = [];
    let memberDeletes = 0;

    const members = await ctx.db.query("organizationMembers").collect();
    for (const m of members) {
      if (budget.remaining <= 0) break;
      const org = await ctx.db.get(m.organizationId);
      if (!org) {
        if (args.dryRun) {
          memberDeletes++;
          detail.push(`would delete member ${m._id}`);
          budget.remaining--;
        } else {
          await ctx.db.delete(m._id);
          memberDeletes++;
          budget.remaining--;
        }
      }
    }

    await clearOptionalOrgRefs(ctx, "pipeline", args.dryRun, budget, detail);
    await clearOptionalOrgRefs(ctx, "contacts", args.dryRun, budget, detail);
    await clearOptionalOrgRefs(ctx, "lenders", args.dryRun, budget, detail);
    await clearOptionalOrgRefs(ctx, "tasks", args.dryRun, budget, detail);
    await clearOptionalOrgRefs(ctx, "libraryDocuments", args.dryRun, budget, detail);

    orgIntegrityTrace("repairOrganizationReferences", {
      dryRun: args.dryRun,
      memberDeletes,
      remainingBudget: budget.remaining,
    });

    return {
      dryRun: args.dryRun,
      memberDeletes,
      otherPatches: max - budget.remaining - memberDeletes,
      detail: detail.slice(0, 80),
    };
  },
});
