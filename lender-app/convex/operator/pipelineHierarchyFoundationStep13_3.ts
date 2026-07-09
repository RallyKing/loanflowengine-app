/**
 * Phase 13.3 Step 2 — hierarchy foundation backwards-compatibility proof.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  filterPipelineRowsForMember,
  resolvePipelineAccessLevel,
  resolveRowOwnerUserId,
} from "../resourceAccess";
import {
  hierarchyIdentityKey,
  resolveFileHierarchy,
} from "../pipelineHierarchyCompat";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";

export const runHierarchyFoundationProof = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);

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

    const clientRows = await ctx.db
      .query("clients")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();

    const projectRows = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();

    const fileSnapshots: Array<{
      fileId: string;
      ownerUserId: string;
      accessLevel: string;
      hasClientFk: boolean;
      hasProjectFk: boolean;
      hierarchyKind: string;
      legacyIdentityKey: string;
    }> = [];

    for (const file of visible) {
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
        hasClientFk: Boolean(file.clientId),
        hasProjectFk: Boolean(file.projectId),
        hierarchyKind: hierarchy.resolution,
        legacyIdentityKey: hierarchyIdentityKey(hierarchy),
      });
    }

    const distinctLegacyKeys = new Set(
      fileSnapshots.map((s) => s.legacyIdentityKey),
    );

    const ownerIds = [...new Set(fileSnapshots.map((s) => s.ownerUserId))].sort();
    const joshuaOwnedCount = fileSnapshots.filter(
      (s) => s.ownerUserId === JOSHUA_USER_ID,
    ).length;

    const checks = {
      orgFileCount12: allOrgFiles.length === 12,
      visibleCount12: visible.length === 12,
      allLegacyFkAbsent: fileSnapshots.every(
        (s) => !s.hasClientFk && !s.hasProjectFk,
      ),
      allLegacyResolution: fileSnapshots.every((s) =>
        ["legacy_deal_data", "legacy_file_name"].includes(s.hierarchyKind),
      ),
      /** Prod has 11 Joshua-owned + 1 team-owned file; visibility must remain 12 for Joshua. */
      joshuaOwnedCount11: joshuaOwnedCount === 11,
      ownerIdSetUnchanged: ownerIds.length === 2,
      allAccessEditForJoshua: fileSnapshots.every((s) => s.accessLevel === "edit"),
      distinctLegacyPairs12: distinctLegacyKeys.size === 12,
      noNormalizedClientsYet: clientRows.length === 0,
      noNormalizedProjectsYet: projectRows.length === 0,
    };

    const pass = Object.values(checks).every(Boolean);

    return {
      pass,
      checks,
      organizationId: String(JOSHUA_ORG_ID),
      counts: {
        orgFiles: allOrgFiles.length,
        visibleFiles: visible.length,
        joshuaOwnedVisible: joshuaOwnedCount,
        distinctOwnerIds: ownerIds.length,
        ownerIds,
        clients: clientRows.length,
        projects: projectRows.length,
        distinctLegacyIdentityKeys: distinctLegacyKeys.size,
      },
      fileSnapshots,
      note: "Proof is read-only on existing prod rows; no backfill performed.",
    };
  },
});
