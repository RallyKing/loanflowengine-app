/**
 * Phase 13.1B — permission banner / ACL live proof.
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
  buildPipelineViewerAccess,
  buildTaskViewerAccess,
} from "../resourceViewerAccess";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";

export const runPermissionBannersProof = mutation({
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

    const cleanupFile = async () => {
      await removeResourceShare(ctx, {
        resourceType: "pipeline",
        resourceId: String(file._id),
        sharedUserId: EBALLARD_USER_ID,
      });
    };
    const cleanupTask = async () => {
      await removeResourceShare(ctx, {
        resourceType: "task",
        resourceId: String(task._id),
        sharedUserId: EBALLARD_USER_ID,
      });
    };
    await cleanupFile();
    await cleanupTask();

    const joshuaFileOwner = await buildPipelineViewerAccess(
      ctx,
      file,
      JOSHUA_USER_ID,
    );
    const joshuaTaskOwner = await buildTaskViewerAccess(ctx, task, JOSHUA_USER_ID);

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "pipeline",
      resourceId: String(file._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "view",
      createdByUserId: JOSHUA_USER_ID,
    });
    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "task",
      resourceId: String(task._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "view",
      createdByUserId: JOSHUA_USER_ID,
    });

    const eballardFileView = await buildPipelineViewerAccess(
      ctx,
      file,
      EBALLARD_USER_ID,
    );
    const eballardTaskView = await buildTaskViewerAccess(
      ctx,
      task,
      EBALLARD_USER_ID,
    );
    const eballardFilesVisible = (
      await filterPipelineRowsForMember(
        ctx,
        files,
        JOSHUA_ORG_ID,
        EBALLARD_USER_ID,
      )
    ).some((f) => String(f._id) === String(file._id));

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "pipeline",
      resourceId: String(file._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "edit",
      createdByUserId: JOSHUA_USER_ID,
    });
    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "task",
      resourceId: String(task._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "edit",
      createdByUserId: JOSHUA_USER_ID,
    });

    const eballardFileEdit = await buildPipelineViewerAccess(
      ctx,
      file,
      EBALLARD_USER_ID,
    );
    const eballardTaskEdit = await buildTaskViewerAccess(
      ctx,
      task,
      EBALLARD_USER_ID,
    );

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "pipeline",
      resourceId: String(file._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "view",
      createdByUserId: JOSHUA_USER_ID,
    });
    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "task",
      resourceId: String(task._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "view",
      createdByUserId: JOSHUA_USER_ID,
    });

    const eballardFileDowngrade = await buildPipelineViewerAccess(
      ctx,
      file,
      EBALLARD_USER_ID,
    );

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

    const eballardFileRevoked = await buildPipelineViewerAccess(
      ctx,
      file,
      EBALLARD_USER_ID,
    );
    const eballardFilesAfterRevoke = (
      await filterPipelineRowsForMember(
        ctx,
        files,
        JOSHUA_ORG_ID,
        EBALLARD_USER_ID,
      )
    ).some((f) => String(f._id) === String(file._id));

    const pass =
      joshuaFileOwner.bannerMode === "none" &&
      joshuaTaskOwner.bannerMode === "none" &&
      eballardFileView.bannerMode === "view" &&
      !eballardFileView.canMutate &&
      eballardTaskView.bannerMode === "view" &&
      !eballardTaskView.canMutate &&
      eballardFilesVisible &&
      eballardFileEdit.bannerMode === "edit" &&
      eballardFileEdit.canMutate &&
      eballardTaskEdit.bannerMode === "edit" &&
      eballardTaskEdit.canMutate &&
      eballardFileDowngrade.bannerMode === "view" &&
      !eballardFileDowngrade.canMutate &&
      eballardFileRevoked.accessLevel === "none" &&
      !eballardFilesAfterRevoke;

    return {
      pass,
      fileId: String(file._id),
      taskId: String(task._id),
      matrix: {
        joshuaOwner: { file: joshuaFileOwner, task: joshuaTaskOwner },
        eballardView: { file: eballardFileView, task: eballardTaskView, fileVisible: eballardFilesVisible },
        eballardEdit: { file: eballardFileEdit, task: eballardTaskEdit },
        downgrade: { file: eballardFileDowngrade },
        revoke: { file: eballardFileRevoked, fileVisible: eballardFilesAfterRevoke },
      },
    };
  },
});
