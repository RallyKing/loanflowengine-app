/**
 * Phase 13.3 Step 3 — production backfill operator (analyze / execute / proof).
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  analyzeHierarchyBackfill,
  captureBackfillMatrix,
  captureJoshuaVisibilitySnapshot,
  executeHierarchyBackfill,
  validateBackfillIntegrity,
} from "../pipelineHierarchyBackfill";
import {
  filterPipelineRowsForMember,
  resolvePipelineAccessLevel,
  resolveRowOwnerUserId,
} from "../resourceAccess";
import { resolveFileHierarchy } from "../pipelineHierarchyCompat";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";

/** Dry-run grouping report — no writes. */
export const analyzeBackfill = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    const analyze = await analyzeHierarchyBackfill(ctx);
    const matrix = await captureBackfillMatrix(ctx);
    return { analyze, matrix };
  },
});

/** Execute backfill (writes clients, projects, FK patches only). */
export const executeBackfill = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminSecret, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);
    return await executeHierarchyBackfill(ctx, { dryRun: dryRun === true });
  },
});

/** Post-backfill integrity + Joshua zero-drift proof. */
export const runBackfillProof = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);

    const matrix = await captureBackfillMatrix(ctx);
    const joshuaNow = await captureJoshuaVisibilitySnapshot(ctx);
    const integrity = await validateBackfillIntegrity(ctx, JOSHUA_ORG_ID);

    const allOrgFiles = await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();

    const fileSnapshots: Array<{
      fileId: string;
      ownerUserId: string;
      accessLevel: string;
      clientId: string | null;
      projectId: string | null;
      hierarchyResolution: string;
    }> = [];

    for (const file of allOrgFiles) {
      const access = await resolvePipelineAccessLevel(
        ctx,
        file,
        JOSHUA_USER_ID,
      );
      const hierarchy = await resolveFileHierarchy(ctx, file);
      fileSnapshots.push({
        fileId: String(file._id),
        ownerUserId: resolveRowOwnerUserId(file),
        accessLevel: access,
        clientId: file.clientId ? String(file.clientId) : null,
        projectId: file.projectId ? String(file.projectId) : null,
        hierarchyResolution: hierarchy.resolution,
      });
    }

    const visible = await filterPipelineRowsForMember(
      ctx,
      allOrgFiles,
      JOSHUA_ORG_ID,
      JOSHUA_USER_ID,
    );

    const shares = await ctx.db.query("resourceShares").collect();

    const checks = {
      ...integrity.checks,
      visibleCount12: visible.length === 12,
      allFkLinked: fileSnapshots.every(
        (s) => s.clientId && s.projectId,
      ),
      allForeignKeysResolution: fileSnapshots.every(
        (s) => s.hierarchyResolution === "foreign_keys",
      ),
      allAccessEditForJoshua: fileSnapshots.every(
        (s) => s.accessLevel === "edit",
      ),
      clients12: matrix.clientCount >= 12,
      projects12: matrix.projectCount >= 12,
      legacyUnlinkedZero: matrix.legacyUnlinkedFiles === 0,
    };

    const pass = Object.values(checks).every(Boolean);

    return {
      pass,
      checks,
      matrix,
      integrity,
      joshuaVisibility: joshuaNow,
      resourceShareCount: shares.length,
      pipelineResourceShareCount: shares.filter(
        (s) => s.resourceType === "pipeline",
      ).length,
      fileSnapshots,
    };
  },
});
