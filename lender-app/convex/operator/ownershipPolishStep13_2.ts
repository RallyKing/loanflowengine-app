/**
 * Phase 13.2 — ownership + sharing identity polish live proof.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  filterPipelineRowsForMember,
  removeResourceShare,
  upsertResourceShare,
} from "../resourceAccess";
import {
  buildPipelineOwnershipPresentation,
  buildTaskOwnershipPresentation,
} from "../resourceOwnershipPresentation";
import { shareFileImpl } from "../pipelineFileShares";
import { resolveDisplayUsernameForUserKey } from "../auth/displayIdentity";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";

async function latestShareActivitySummary(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
): Promise<string | null> {
  const rows = await ctx.db
    .query("pipelineFileActivity")
    .withIndex("by_file_at", (q) => q.eq("fileId", fileId))
    .order("desc")
    .take(8);
  const hit = rows.find(
    (r) =>
      r.kind === "share_grant" ||
      r.kind === "share_update" ||
      r.kind === "share_revoke",
  );
  return hit?.summary?.trim() ?? null;
}

export const runOwnershipPolishProof = mutation({
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
    const file = joshuaFiles[0];
    if (!file) throw new Error("Need a Joshua-owned pipeline file.");

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .collect();
    const task =
      tasks.find((t) => t.ownerUserId === JOSHUA_USER_ID) ?? tasks[0];
    if (!task) throw new Error("Need a Joshua-owned task.");

    const cleanup = async () => {
      await removeResourceShare(ctx, {
        resourceType: "pipeline",
        resourceId: String(file._id),
        sharedUserId: EBALLARD_USER_ID,
      });
      await removeResourceShare(ctx, {
        resourceType: "task",
        resourceId: String(task._id),
        sharedUserId: EBALLARD_USER_ID,
      });
    };
    await cleanup();

    const joshuaOwner = await buildPipelineOwnershipPresentation(
      ctx,
      file,
      JOSHUA_USER_ID,
    );
    const joshuaTaskOwner = await buildTaskOwnershipPresentation(
      ctx,
      task,
      JOSHUA_USER_ID,
    );
    const joshuaUsername = await resolveDisplayUsernameForUserKey(
      ctx,
      JOSHUA_USER_ID,
    );

    await shareFileImpl(ctx, {
      fileId: file._id,
      targetUserKey: EBALLARD_USER_ID,
      permission: "view",
      memberUserKey: JOSHUA_USER_ID,
    });
    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "task",
      resourceId: String(task._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "view",
      createdByUserId: JOSHUA_USER_ID,
    });

    const eballardFile = await buildPipelineOwnershipPresentation(
      ctx,
      file,
      EBALLARD_USER_ID,
    );
    const eballardTask = await buildTaskOwnershipPresentation(
      ctx,
      task,
      EBALLARD_USER_ID,
    );

    const activitySummary = await latestShareActivitySummary(ctx, file._id);

    await shareFileImpl(ctx, {
      fileId: file._id,
      targetUserKey: EBALLARD_USER_ID,
      permission: "edit",
      memberUserKey: JOSHUA_USER_ID,
    });
    const eballardFileEdit = await buildPipelineOwnershipPresentation(
      ctx,
      file,
      EBALLARD_USER_ID,
    );

    await cleanup();

    const checks = {
      joshuaFileBadgeOwner: joshuaOwner?.badge === "owner",
      joshuaFileLineOwned: joshuaOwner?.ownershipLine.startsWith("Owned by"),
      joshuaTaskBadgeOwner: joshuaTaskOwner?.badge === "owner",
      eballardFileSharedByJoshua:
        eballardFile?.ownershipLine === `Shared by ${joshuaUsername}`,
      eballardFileBadgeView: eballardFile?.badge === "shared_view",
      eballardTaskSharedByJoshua:
        eballardTask?.ownershipLine === `Shared by ${joshuaUsername}`,
      eballardTaskBadgeView: eballardTask?.badge === "shared_view",
      eballardFileBadgeEditAfterUpgrade:
        eballardFileEdit?.badge === "shared_edit",
      activityUsesUsername:
        activitySummary != null &&
        activitySummary.includes(joshuaUsername) &&
        !activitySummary.toLowerCase().includes("direct lending"),
      activityNoOrgLabel:
        activitySummary == null ||
        !/\bshared resource\b/i.test(activitySummary),
    };

    const pass = Object.values(checks).every(Boolean);

    return {
      pass,
      checks,
      joshuaUsername,
      activitySummary,
      resourceIds: {
        fileId: String(file._id),
        taskId: String(task._id),
      },
    };
  },
});
