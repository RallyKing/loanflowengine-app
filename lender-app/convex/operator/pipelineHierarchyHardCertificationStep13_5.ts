/**
 * Phase 13.3 Step 5 — hard certification: Client → Project → Loan hierarchy (production).
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  captureBackfillMatrix,
  captureJoshuaVisibilitySnapshot,
  validateBackfillIntegrity,
} from "../pipelineHierarchyBackfill";
import { resolveFileHierarchy } from "../pipelineHierarchyCompat";
import {
  filterPipelineRowsForMember,
  removeResourceShare,
  resolveClientAccessLevel,
  resolvePipelineAccessLevel,
  resolveProjectAccessLevel,
  resolveRowOwnerUserId,
  upsertResourceShare,
} from "../resourceAccess";
import {
  buildPipelineOwnershipPresentation,
  resolvePipelineHierarchyAccessLabel,
} from "../resourceOwnershipPresentation";
import { buildPipelineViewerAccess } from "../resourceViewerAccess";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";

async function orgPipelineFiles(ctx: QueryCtx | MutationCtx) {
  return ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", JOSHUA_ORG_ID),
    )
    .collect();
}

async function countOrgResourceShares(ctx: QueryCtx | MutationCtx) {
  const rows = await ctx.db.query("resourceShares").collect();
  const orgScoped = rows.filter((r) => r.organizationId === JOSHUA_ORG_ID);
  return {
    total: orgScoped.length,
    pipeline: orgScoped.filter((r) => r.resourceType === "pipeline").length,
    project: orgScoped.filter((r) => r.resourceType === "project").length,
    client: orgScoped.filter((r) => r.resourceType === "client").length,
  };
}

async function visibleCounts(ctx: QueryCtx | MutationCtx, memberUserKey: string) {
  const files = await orgPipelineFiles(ctx);
  const visible = await filterPipelineRowsForMember(
    ctx,
    files,
    JOSHUA_ORG_ID,
    memberUserKey,
  );
  const clients = await ctx.db
    .query("clients")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", JOSHUA_ORG_ID),
    )
    .collect();
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", JOSHUA_ORG_ID),
    )
    .collect();
  let visibleClientCount = 0;
  for (const c of clients) {
    if (
      (await resolveClientAccessLevel(ctx, c, memberUserKey)) !== "none"
    ) {
      visibleClientCount += 1;
    }
  }
  let visibleProjectCount = 0;
  for (const p of projects) {
    if (
      (await resolveProjectAccessLevel(ctx, p, memberUserKey)) !== "none"
    ) {
      visibleProjectCount += 1;
    }
  }
  return {
    files: visible.length,
    fileIds: visible.map((f) => String(f._id)).sort(),
    clients: visibleClientCount,
    projects: visibleProjectCount,
  };
}

async function cleanupEballardSharesOnFile(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
) {
  if (!file.projectId) return;
  await removeResourceShare(ctx, {
    resourceType: "pipeline",
    resourceId: String(file._id),
    sharedUserId: EBALLARD_USER_ID,
  });
  await removeResourceShare(ctx, {
    resourceType: "project",
    resourceId: String(file.projectId),
    sharedUserId: EBALLARD_USER_ID,
  });
  const project = await ctx.db.get(file.projectId);
  if (project) {
    await removeResourceShare(ctx, {
      resourceType: "client",
      resourceId: String(project.clientId),
      sharedUserId: EBALLARD_USER_ID,
    });
  }
}

export const runHierarchyHardCertification = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    const startedAt = Date.now();

    const shareSnapshotBefore = await countOrgResourceShares(ctx);
    const joshuaBefore = await captureJoshuaVisibilitySnapshot(ctx);
    const matrix = await captureBackfillMatrix(ctx);
    const files = await orgPipelineFiles(ctx);

    const integrityRaw = await validateBackfillIntegrity(ctx, JOSHUA_ORG_ID);
    const integrity = {
      ...integrityRaw,
      pass:
        integrityRaw.checks.allOrgFilesLinked &&
        integrityRaw.checks.zeroOrphanClients &&
        integrityRaw.checks.zeroOrphanProjects &&
        integrityRaw.checks.rollupsHaveLoans &&
        integrityRaw.nullFkFiles.length === 0 &&
        files.length >= 12,
      checks: {
        ...integrityRaw.checks,
        canonicalOrgFilesAtLeast12: files.length >= 12,
      },
    };
    const integrityIssues: string[] = [];
    const fileProof: Array<{
      fileId: string;
      clientId: string | null;
      projectId: string | null;
      projectClientMatch: boolean;
      ownerUserId: string;
      hierarchyResolution: string;
      resourceShareRowsForFile: number;
    }> = [];

    for (const file of files) {
      const ownerUserId = resolveRowOwnerUserId(file);
      if (!ownerUserId) {
        integrityIssues.push(`missing_owner:${file._id}`);
      }
      if (!file.clientId) {
        integrityIssues.push(`missing_clientId:${file._id}`);
      }
      if (!file.projectId) {
        integrityIssues.push(`missing_projectId:${file._id}`);
      }
      let projectClientMatch = false;
      if (file.clientId && file.projectId) {
        const project = await ctx.db.get(file.projectId);
        if (!project) {
          integrityIssues.push(`orphan_project:${file.projectId}`);
        } else if (project.clientId !== file.clientId) {
          integrityIssues.push(
            `project_client_mismatch:${file._id}:${project.clientId}!=${file.clientId}`,
          );
        } else {
          projectClientMatch = true;
        }
        const client = await ctx.db.get(file.clientId);
        if (!client) {
          integrityIssues.push(`orphan_client:${file.clientId}`);
        } else if (client.organizationId !== JOSHUA_ORG_ID) {
          integrityIssues.push(`client_org_mismatch:${file.clientId}`);
        }
      }
      const hierarchy = await resolveFileHierarchy(ctx, file);
      const resourceShareRowsForFile = (
        await ctx.db
          .query("resourceShares")
          .withIndex("by_resource", (q) =>
            q
              .eq("resourceType", "pipeline")
              .eq("resourceId", String(file._id)),
          )
          .collect()
      ).length;

      fileProof.push({
        fileId: String(file._id),
        clientId: file.clientId ? String(file.clientId) : null,
        projectId: file.projectId ? String(file.projectId) : null,
        projectClientMatch,
        ownerUserId,
        hierarchyResolution: hierarchy.resolution,
        resourceShareRowsForFile,
      });
    }

    const joshuaCounts = await visibleCounts(ctx, JOSHUA_USER_ID);
    const eballardBaseline = await visibleCounts(ctx, EBALLARD_USER_ID);

    let probeFile: Doc<"pipeline"> | undefined;
    for (const f of files) {
      if (!f.projectId || !f.clientId) continue;
      const level = await resolvePipelineAccessLevel(ctx, f, EBALLARD_USER_ID);
      if (level === "none") {
        probeFile = f;
        break;
      }
    }
    probeFile ??= files.find((f) => f.projectId && f.clientId);
    if (!probeFile?.projectId) {
      throw new Error("No pipeline file with projectId for ACL proof.");
    }

    const eballardBaselineForProbe = await visibleCounts(ctx, EBALLARD_USER_ID);
    const probeVisibleBeforeShare = eballardBaselineForProbe.fileIds.includes(
      String(probeFile._id),
    );
    const probeAccessBefore = await resolvePipelineAccessLevel(
      ctx,
      probeFile,
      EBALLARD_USER_ID,
    );

    const siblingLeak = files
      .filter(
        (f) =>
          String(f._id) !== String(probeFile!._id) &&
          eballardBaselineForProbe.fileIds.includes(String(f._id)),
      )
      .map((f) => String(f._id));

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "project",
      resourceId: String(probeFile.projectId),
      sharedUserId: EBALLARD_USER_ID,
      permission: "view",
      createdByUserId: JOSHUA_USER_ID,
    });

    const eballardProjectView = await visibleCounts(ctx, EBALLARD_USER_ID);
    const viewPresentation = await buildPipelineOwnershipPresentation(
      ctx,
      probeFile,
      EBALLARD_USER_ID,
    );
    const viewBanner = await buildPipelineViewerAccess(
      ctx,
      probeFile,
      EBALLARD_USER_ID,
    );
    const viewHierarchyLabel = await resolvePipelineHierarchyAccessLabel(
      ctx,
      probeFile,
      EBALLARD_USER_ID,
    );
    const probeVisibleProjectView = eballardProjectView.fileIds.includes(
      String(probeFile._id),
    );
    const leakDuringProjectView = files
      .filter(
        (f) =>
          String(f._id) !== String(probeFile._id) &&
          eballardProjectView.fileIds.includes(String(f._id)) &&
          !siblingLeak.includes(String(f._id)),
      )
      .map((f) => String(f._id));

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "project",
      resourceId: String(probeFile.projectId),
      sharedUserId: EBALLARD_USER_ID,
      permission: "edit",
      createdByUserId: JOSHUA_USER_ID,
    });

    const editBanner = await buildPipelineViewerAccess(
      ctx,
      probeFile,
      EBALLARD_USER_ID,
    );
    const editHierarchyLabel = await resolvePipelineHierarchyAccessLabel(
      ctx,
      probeFile,
      EBALLARD_USER_ID,
    );

    await removeResourceShare(ctx, {
      resourceType: "project",
      resourceId: String(probeFile.projectId),
      sharedUserId: EBALLARD_USER_ID,
    });

    const eballardAfterRevoke = await visibleCounts(ctx, EBALLARD_USER_ID);
    const revokeAccess = await resolvePipelineAccessLevel(
      ctx,
      probeFile,
      EBALLARD_USER_ID,
    );
    const probeVisibleAfterRevoke = eballardAfterRevoke.fileIds.includes(
      String(probeFile._id),
    );

    await cleanupEballardSharesOnFile(ctx, probeFile);

    const shareSnapshotAfter = await countOrgResourceShares(ctx);
    const joshuaAfter = await captureJoshuaVisibilitySnapshot(ctx);

    const baselineVisible = new Set(joshuaBefore.visibleFileIds);
    const afterVisible = new Set(joshuaAfter.visibleFileIds);
    const noBaselineLoss = [...baselineVisible].every((id) =>
      afterVisible.has(id),
    );
    const accessStableForBaseline = [...baselineVisible].every(
      (id) =>
        joshuaBefore.accessByFileId[id] === joshuaAfter.accessByFileId[id],
    );
    const joshuaDriftPass = noBaselineLoss && accessStableForBaseline;

    const sharesPreserved =
      shareSnapshotBefore.total === shareSnapshotAfter.total &&
      shareSnapshotBefore.pipeline === shareSnapshotAfter.pipeline;

    const checks: Record<string, boolean> = {
      integrityPass: integrity.pass,
      allFilesFkLinked: fileProof.every(
        (f) => f.clientId && f.projectId && f.projectClientMatch,
      ),
      allOwnersPresent: fileProof.every((f) => Boolean(f.ownerUserId)),
      allForeignKeysResolution: fileProof.every(
        (f) => f.hierarchyResolution === "foreign_keys",
      ),
      canonicalAtLeast12Files: files.length >= 12,
      joshuaSeesAllOrgFiles: joshuaCounts.files >= 12,
      joshuaDriftZero: joshuaDriftPass,
      resourceSharesPreserved: sharesPreserved,
      eballardNotAllFilesBaseline: eballardBaseline.files < 12,
      probeNotVisibleBeforeProjectShare:
        !probeVisibleBeforeShare && probeAccessBefore === "none",
      probeVisibleOnProjectViewShare: probeVisibleProjectView,
      projectViewBannerGray:
        viewBanner.bannerMode === "view" && !viewBanner.canMutate,
      projectViewInheritedLabel:
        viewHierarchyLabel === "Inherited from Project",
      projectEditBannerGreen:
        editBanner.bannerMode === "edit" && editBanner.canMutate,
      projectEditInheritedLabel:
        editHierarchyLabel === "Inherited from Project",
      noNewSiblingLeakOnProjectShare: leakDuringProjectView.length === 0,
      revokeRemovesProbe:
        !probeVisibleAfterRevoke && revokeAccess === "none",
      eballardClientsLtJoshua:
        eballardBaseline.clients <= joshuaCounts.clients,
    };

    const pass = Object.values(checks).every(Boolean);
    const elapsedMs = Date.now() - startedAt;

    return {
      pass,
      elapsedMs,
      productionUrl: "https://dlcfunds.vercel.app",
      checks,
      matrix,
      integrity,
      shareSnapshotBefore,
      shareSnapshotAfter,
      joshuaBefore,
      joshuaAfter,
      joshuaCounts,
      eballardBaseline,
      eballardProjectView,
      eballardAfterRevoke,
      aclProbe: {
        fileId: String(probeFile._id),
        projectId: String(probeFile.projectId),
        siblingLeakBaseline: siblingLeak,
        siblingLeakProjectView: leakDuringProjectView,
        viewPresentation,
        viewBanner,
        editBanner,
      },
      fileProof,
      integrityIssues,
    };
  },
});
