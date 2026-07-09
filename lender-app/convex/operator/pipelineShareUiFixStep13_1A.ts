/**
 * Phase 13.1A — pipeline share UI fix live proof (resourceShares only).
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  filterPipelineRowsForMember,
  removeResourceShare,
  resolvePipelineAccessLevel,
  resolveRowOwnerUserId,
  upsertResourceShare,
} from "../resourceAccess";
import { resolveShareTargetUserKey } from "../shareTargetResolve";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";
const SECOND_USER_ID = "ts7ck8e4qmm6c22jvyrphws01587bm5c";
const TARGET_EMAIL = "joshuaeballard@gmail.com";

async function shareViaAcl(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  targetUserKey: string,
  permission: "view" | "edit",
) {
  const file = await ctx.db.get(fileId);
  if (!file?.organizationId) throw new Error("File missing org.");
  await upsertResourceShare(ctx, {
    organizationId: file.organizationId,
    resourceType: "pipeline",
    resourceId: String(fileId),
    sharedUserId: targetUserKey,
    permission,
    createdByUserId: JOSHUA_USER_ID,
  });
}

async function listShareCount(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
  viewerKey: string,
) {
  const file = await ctx.db.get(fileId);
  if (!file) return { visible: false, shareRows: 0, access: "none" as const };
  const access = await resolvePipelineAccessLevel(ctx, file, viewerKey);
  const rows = await ctx.db
    .query("resourceShares")
    .withIndex("by_resource", (q) =>
      q.eq("resourceType", "pipeline").eq("resourceId", String(fileId)),
    )
    .collect();
  return {
    visible: access !== "none",
    shareRows: rows.length,
    access,
  };
}

export const runPipelineShareUiFixProof = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);

    const files = await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();
    const joshuaFiles = await filterPipelineRowsForMember(
      ctx,
      files,
      JOSHUA_ORG_ID,
      JOSHUA_USER_ID,
    );
    const file = joshuaFiles.find((f) => resolveRowOwnerUserId(f) === JOSHUA_USER_ID) ?? joshuaFiles[0];
    if (!file) throw new Error("Joshua must own at least one pipeline file.");

    const fileId = file._id;
    const cleanup = async () => {
      await removeResourceShare(ctx, {
        resourceType: "pipeline",
        resourceId: String(fileId),
        sharedUserId: EBALLARD_USER_ID,
      });
      await removeResourceShare(ctx, {
        resourceType: "pipeline",
        resourceId: String(fileId),
        sharedUserId: SECOND_USER_ID,
      });
    };
    await cleanup();

    const baselineE = await listShareCount(ctx, fileId, EBALLARD_USER_ID);
    const baselineS = await listShareCount(ctx, fileId, SECOND_USER_ID);

    await shareViaAcl(ctx, fileId, EBALLARD_USER_ID, "view");
    const afterViewE = await listShareCount(ctx, fileId, EBALLARD_USER_ID);
    const sharesAfterView = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "pipeline").eq("resourceId", String(fileId)),
      )
      .collect();

    await shareViaAcl(ctx, fileId, SECOND_USER_ID, "edit");
    const afterBothE = await listShareCount(ctx, fileId, EBALLARD_USER_ID);
    const afterBothS = await listShareCount(ctx, fileId, SECOND_USER_ID);
    const sharesAfterBoth = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "pipeline").eq("resourceId", String(fileId)),
      )
      .collect();

    await shareViaAcl(ctx, fileId, EBALLARD_USER_ID, "edit");
    const afterUpgradeE = await listShareCount(ctx, fileId, EBALLARD_USER_ID);
    const upgradedPermission = (
      await ctx.db
        .query("resourceShares")
        .withIndex("by_resource_user", (q) =>
          q
            .eq("resourceType", "pipeline")
            .eq("resourceId", String(fileId))
            .eq("sharedUserId", EBALLARD_USER_ID),
        )
        .first()
    )?.permission;

    await removeResourceShare(ctx, {
      resourceType: "pipeline",
      resourceId: String(fileId),
      sharedUserId: EBALLARD_USER_ID,
    });
    const afterRevokeOneE = await listShareCount(ctx, fileId, EBALLARD_USER_ID);
    const afterRevokeOneS = await listShareCount(ctx, fileId, SECOND_USER_ID);
    const sharesAfterRevokeOne = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "pipeline").eq("resourceId", String(fileId)),
      )
      .collect();

    await removeResourceShare(ctx, {
      resourceType: "pipeline",
      resourceId: String(fileId),
      sharedUserId: SECOND_USER_ID,
    });
    const afterRevokeAllE = await listShareCount(ctx, fileId, EBALLARD_USER_ID);
    const afterRevokeAllS = await listShareCount(ctx, fileId, SECOND_USER_ID);

    const emailResolved = await resolveShareTargetUserKey(
      ctx,
      JOSHUA_ORG_ID,
      TARGET_EMAIL,
    );

    const pass =
      baselineE.visible === false &&
      baselineS.visible === false &&
      afterViewE.visible === true &&
      afterViewE.access === "view" &&
      sharesAfterView.length === 1 &&
      afterBothE.visible === true &&
      afterBothS.visible === true &&
      afterBothS.access === "edit" &&
      sharesAfterBoth.length === 2 &&
      afterUpgradeE.access === "edit" &&
      upgradedPermission === "edit" &&
      afterRevokeOneE.visible === false &&
      afterRevokeOneS.visible === true &&
      sharesAfterRevokeOne.length === 1 &&
      afterRevokeAllE.visible === false &&
      afterRevokeAllS.visible === false &&
      emailResolved === EBALLARD_USER_ID;

    return {
      pass,
      fileId: String(fileId),
      ownerUserId: file.ownerUserId ?? file.ownerUserKey,
      targetEmail: TARGET_EMAIL,
      matrix: {
        baseline: { eballard: baselineE, second: baselineS },
        viewShare: { eballard: afterViewE, shareCount: sharesAfterView.length },
        dualShare: {
          eballard: afterBothE,
          second: afterBothS,
          shareCount: sharesAfterBoth.length,
        },
        upgrade: { eballard: afterUpgradeE, permission: upgradedPermission },
        revokeOne: {
          eballard: afterRevokeOneE,
          second: afterRevokeOneS,
          shareCount: sharesAfterRevokeOne.length,
        },
        revokeAll: { eballard: afterRevokeAllE, second: afterRevokeAllS },
      },
    };
  },
});
