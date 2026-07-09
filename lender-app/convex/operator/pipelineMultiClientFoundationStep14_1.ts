/**
 * Phase 14 Step 1 — multi-client junction backfill + production proof.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  analyzeMultiClientBackfill,
  captureMultiClientIntegrity,
  executeMultiClientBackfill,
} from "../pipelineMultiClientBackfill";
import {
  captureBackfillMatrix,
  captureJoshuaVisibilitySnapshot,
} from "../pipelineHierarchyBackfill";
import {
  filterPipelineRowsForMember,
  resolvePipelineAccessLevel,
  resolveRowOwnerUserId,
} from "../resourceAccess";
import { resolveFileHierarchy } from "../pipelineHierarchyCompat";
import { loadPipelineFilesForClient } from "../pipelineHierarchyCompat";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";

async function countOrgResourceShares(ctx: { db: { query: (t: "resourceShares") => { collect: () => Promise<Array<{ organizationId?: Id<"organizations">; resourceType: string }>> } } }) {
  const rows = await ctx.db.query("resourceShares").collect();
  const orgScoped = rows.filter((r) => r.organizationId === JOSHUA_ORG_ID);
  return {
    total: orgScoped.length,
    pipeline: orgScoped.filter((r) => r.resourceType === "pipeline").length,
    project: orgScoped.filter((r) => r.resourceType === "project").length,
    client: orgScoped.filter((r) => r.resourceType === "client").length,
  };
}

export const analyzeMultiClientFoundation = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    const analyze = await analyzeMultiClientBackfill(ctx);
    const integrity = await captureMultiClientIntegrity(ctx);
    const matrix = await captureBackfillMatrix(ctx);
    return { analyze, integrity, matrix };
  },
});

export const executeMultiClientFoundation = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminSecret, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);
    return await executeMultiClientBackfill(ctx, { dryRun: dryRun === true });
  },
});

export const runMultiClientFoundationProof = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);

    const integrity = await captureMultiClientIntegrity(ctx);
    const matrix = await captureBackfillMatrix(ctx);
    const joshuaNow = await captureJoshuaVisibilitySnapshot(ctx);
    const shares = await countOrgResourceShares(ctx);

    const allOrgFiles = await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();

    const visible = await filterPipelineRowsForMember(
      ctx,
      allOrgFiles,
      JOSHUA_ORG_ID,
      JOSHUA_USER_ID,
    );

    const visibleIds = new Set(visible.map((f) => String(f._id)));
    const accessByFileId: Record<string, string> = {};
    let linkedClientRowCount = 0;
    for (const file of visible) {
      const access = await resolvePipelineAccessLevel(
        ctx,
        file,
        JOSHUA_USER_ID,
      );
      accessByFileId[String(file._id)] = access;
      const hierarchy = await resolveFileHierarchy(ctx, file);
      linkedClientRowCount += hierarchy.linkedClients.length;
    }

    const sampleClient = await ctx.db
      .query("clients")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .first();

    let expandedFileCount = 0;
    if (sampleClient) {
      const expanded = await loadPipelineFilesForClient(ctx, sampleClient._id);
      expandedFileCount = expanded.length;
    }

    const checks = {
      zeroDuplicateProjectPairs: integrity.duplicateProjectClientPairs === 0,
      zeroDuplicateLoanPairs: integrity.duplicateLoanClientPairs === 0,
      allProjectsHavePrimaryLink: integrity.projectsMissingPrimaryLink === 0,
      allLoansWithClientHavePrimaryLink: integrity.loansMissingPrimaryLink === 0,
      projectClientsAtLeastProjects:
        integrity.projectClients >= integrity.projects,
      loanClientsAtLeastPipelineWithClient:
        integrity.loanClients >= integrity.pipelineWithClientId,
      joshuaVisibleFilesAtLeast12: visible.length >= 12,
      joshuaAllVisibleEdit: visible.every(
        (f) => accessByFileId[String(f._id)] === "edit",
      ),
      linkedClientsPresentOnVisible:
        linkedClientRowCount >= visible.filter((f) => f.clientId).length,
    };

    const pass = Object.values(checks).every(Boolean);

    return {
      pass,
      checks,
      organizationId: String(JOSHUA_ORG_ID),
      counts: {
        orgFiles: allOrgFiles.length,
        visibleFiles: visible.length,
        visibleFileIds: [...visibleIds].sort(),
        projectClients: integrity.projectClients,
        loanClients: integrity.loanClients,
        expandedSampleClientFileCount: expandedFileCount,
      },
      matrix,
      joshuaVisibility: joshuaNow,
      resourceShares: shares,
      integrity,
    };
  },
});
