/**
 * Phase 12.2 Step 8B.1 — share-path forensics (task vs pipeline, email resolution).
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findAuthUserByCanonicalLogin } from "../auth/canonicalIdentity";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  assertCanMutatePipelineRow,
  assertCanMutateTaskRow,
  filterPipelineRowsForMember,
  filterTaskRowsForMember,
  removeResourceShare,
  resolvePipelineAccessLevel,
  resolveTaskAccessLevel,
  upsertResourceShare,
} from "../resourceAccess";
import { resolveShareTargetUserKey } from "../shareTargetResolve";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";
const TARGET_EMAIL = "joshuaeballard@gmail.com";
const EMAIL_VARIANTS = [
  "joshuaeballard@gmail.com",
  "JoshuaEBallard@gmail.com",
  "JOSHUAEBALLARD@GMAIL.COM",
] as const;

async function visibilityCounts(ctx: QueryCtx | MutationCtx, memberUserKey: string) {
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
    .collect();
  const files = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", JOSHUA_ORG_ID),
    )
    .collect();
  const visibleTasks = await filterTaskRowsForMember(
    ctx,
    tasks,
    JOSHUA_ORG_ID,
    memberUserKey,
  );
  const visibleFiles = await filterPipelineRowsForMember(
    ctx,
    files,
    JOSHUA_ORG_ID,
    memberUserKey,
  );
  return {
    tasks: visibleTasks.length,
    files: visibleFiles.length,
    taskIds: visibleTasks.map((t) => String(t._id)),
    fileIds: visibleFiles.map((f) => String(f._id)),
  };
}

async function auditEmailVariants(ctx: QueryCtx | MutationCtx) {
  const rows: Array<{
    input: string;
    authUserId: string | null;
    resolvedUserKey: string | null;
    error: string | null;
  }> = [];

  for (const input of EMAIL_VARIANTS) {
    try {
      const authUser = await findAuthUserByCanonicalLogin(ctx, input);
      const resolved = authUser
        ? await resolveShareTargetUserKey(ctx, JOSHUA_ORG_ID, input)
        : null;
      rows.push({
        input,
        authUserId: authUser ? String(authUser._id) : null,
        resolvedUserKey: resolved,
        error: null,
      });
    } catch (e) {
      rows.push({
        input,
        authUserId: null,
        resolvedUserKey: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const authIds = new Set(rows.map((r) => r.authUserId).filter(Boolean));
  const resolvedKeys = new Set(
    rows.map((r) => r.resolvedUserKey).filter(Boolean),
  );
  const pass =
    authIds.size === 1 &&
    authIds.has(EBALLARD_USER_ID) &&
    resolvedKeys.size === 1 &&
    resolvedKeys.has(EBALLARD_USER_ID) &&
    rows.every((r) => !r.error);

  return {
    pass,
    expectedUserId: EBALLARD_USER_ID,
    targetEmail: TARGET_EMAIL,
    variants: rows,
  };
}

/** Mirrors taskShares.upsertShare mutation path. */
async function taskShareUpsertViaEmail(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
  permission: "view" | "edit",
) {
  const target = await resolveShareTargetUserKey(
    ctx,
    JOSHUA_ORG_ID,
    TARGET_EMAIL,
  );
  const shareId = await upsertResourceShare(ctx, {
    organizationId: JOSHUA_ORG_ID,
    resourceType: "task",
    resourceId: String(taskId),
    sharedUserId: target,
    permission,
    createdByUserId: JOSHUA_USER_ID,
  });
  return { shareId, sharedUserId: target };
}

/** Mirrors taskShares.removeShare mutation path. */
async function taskShareRemoveViaEmail(ctx: MutationCtx, taskId: Id<"tasks">) {
  const target = await resolveShareTargetUserKey(
    ctx,
    JOSHUA_ORG_ID,
    TARGET_EMAIL,
  );
  const removed = await removeResourceShare(ctx, {
    resourceType: "task",
    resourceId: String(taskId),
    sharedUserId: target,
  });
  return { removed };
}

/** Mirrors pipelineFileShares.upsertShare mutation path (email target). */
async function pipelineShareUpsertViaEmail(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
) {
  const target = await resolveShareTargetUserKey(
    ctx,
    JOSHUA_ORG_ID,
    TARGET_EMAIL,
  );
  const now = Date.now();
  const access = "edit" as const;
  const existing = await ctx.db
    .query("pipelineFileShares")
    .withIndex("by_file_user", (q) => q.eq("fileId", fileId).eq("userKey", target))
    .first();
  let shareId: Id<"pipelineFileShares">;
  if (existing) {
    await ctx.db.patch(existing._id, {
      access,
      permissionLevel: "edit",
      updatedAt: now,
      createdByUserKey: JOSHUA_USER_ID,
    });
    shareId = existing._id;
  } else {
    shareId = await ctx.db.insert("pipelineFileShares", {
      fileId,
      userKey: target,
      access,
      permissionLevel: "edit",
      shareKind: "direct",
      createdAt: now,
      updatedAt: now,
      createdByUserKey: JOSHUA_USER_ID,
    });
  }
  await upsertResourceShare(ctx, {
    organizationId: JOSHUA_ORG_ID,
    resourceType: "pipeline",
    resourceId: String(fileId),
    sharedUserId: target,
    permission: access,
    createdByUserId: JOSHUA_USER_ID,
  });
  return { shareId, sharedUserId: target };
}

/** Mirrors pipelineFileShares.removeShare mutation path (email target). */
async function pipelineShareRemoveViaEmail(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
) {
  const target = await resolveShareTargetUserKey(
    ctx,
    JOSHUA_ORG_ID,
    TARGET_EMAIL,
  );
  const existing = await ctx.db
    .query("pipelineFileShares")
    .withIndex("by_file_user", (q) => q.eq("fileId", fileId).eq("userKey", target))
    .first();
  if (!existing) return { removed: false as const };
  await ctx.db.delete(existing._id);
  await removeResourceShare(ctx, {
    resourceType: "pipeline",
    resourceId: String(fileId),
    sharedUserId: target,
  });
  return { removed: true as const };
}

export const auditCanonicalEmailLookup = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    return auditEmailVariants(ctx);
  },
});

export const runLiveSharePathProof = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);

    const emailAudit = await auditEmailVariants(ctx);
    const beforeEballard = await visibilityCounts(ctx, EBALLARD_USER_ID);
    const beforeJoshua = await visibilityCounts(ctx, JOSHUA_USER_ID);

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .collect();
    const files = await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();

    const joshuaTasks = await filterTaskRowsForMember(
      ctx,
      tasks,
      JOSHUA_ORG_ID,
      JOSHUA_USER_ID,
    );
    const joshuaFiles = await filterPipelineRowsForMember(
      ctx,
      files,
      JOSHUA_ORG_ID,
      JOSHUA_USER_ID,
    );
    const shareTask = joshuaTasks[0];
    const shareFile = joshuaFiles[0];
    if (!shareTask || !shareFile) {
      throw new Error("Joshua must own at least one task and one file for share proof.");
    }

    const taskShareResult = await taskShareUpsertViaEmail(ctx, shareTask._id, "view");

    const taskResourceShare = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "task").eq("resourceId", String(shareTask._id)),
      )
      .collect();
    const taskShareRow = taskResourceShare.find(
      (r) => r.sharedUserId === EBALLARD_USER_ID,
    );

    const afterTaskShareEballard = await visibilityCounts(ctx, EBALLARD_USER_ID);
    const taskAccessLevel = await resolveTaskAccessLevel(
      ctx,
      shareTask,
      EBALLARD_USER_ID,
    );
    let taskEditDenied = false;
    try {
      await assertCanMutateTaskRow(ctx, shareTask, EBALLARD_USER_ID, "proof_edit");
    } catch {
      taskEditDenied = true;
    }

    const fileShareResult = await pipelineShareUpsertViaEmail(ctx, shareFile._id);

    const pipelineLegacyShare = await ctx.db
      .query("pipelineFileShares")
      .withIndex("by_file_user", (q) =>
        q.eq("fileId", shareFile._id).eq("userKey", EBALLARD_USER_ID),
      )
      .first();
    const pipelineResourceShare = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "pipeline").eq("resourceId", String(shareFile._id)),
      )
      .collect();
    const fileShareRow = pipelineResourceShare.find(
      (r) => r.sharedUserId === EBALLARD_USER_ID,
    );

    const afterBothShareEballard = await visibilityCounts(ctx, EBALLARD_USER_ID);
    const fileAccessLevel = await resolvePipelineAccessLevel(
      ctx,
      shareFile,
      EBALLARD_USER_ID,
    );
    let fileEditAllowed = false;
    try {
      await assertCanMutatePipelineRow(ctx, shareFile, EBALLARD_USER_ID, "proof_edit");
      fileEditAllowed = true;
    } catch {
      fileEditAllowed = false;
    }

    const taskRevoke = await taskShareRemoveViaEmail(ctx, shareTask._id);
    const fileRevoke = await pipelineShareRemoveViaEmail(ctx, shareFile._id);

    const afterRevokeEballard = await visibilityCounts(ctx, EBALLARD_USER_ID);
    const afterRevokeJoshua = await visibilityCounts(ctx, JOSHUA_USER_ID);

    const taskShareStillPresent = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "task").eq("resourceId", String(shareTask._id)),
      )
      .collect();
    const fileShareStillPresent = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "pipeline").eq("resourceId", String(shareFile._id)),
      )
      .collect();

    const pass =
      emailAudit.pass &&
      Boolean(taskShareRow) &&
      taskShareRow?.permission === "view" &&
      Boolean(fileShareRow) &&
      fileShareRow?.permission === "edit" &&
      Boolean(pipelineLegacyShare) &&
      pipelineLegacyShare?.access === "edit" &&
      afterBothShareEballard.tasks === beforeEballard.tasks + 1 &&
      afterBothShareEballard.files === beforeEballard.files + 1 &&
      afterBothShareEballard.taskIds.includes(String(shareTask._id)) &&
      afterBothShareEballard.fileIds.includes(String(shareFile._id)) &&
      taskAccessLevel === "view" &&
      fileAccessLevel === "edit" &&
      taskEditDenied &&
      fileEditAllowed &&
      taskRevoke.removed === true &&
      fileRevoke.removed === true &&
      afterRevokeEballard.tasks === beforeEballard.tasks &&
      afterRevokeEballard.files === beforeEballard.files &&
      !taskShareStillPresent.some((r) => r.sharedUserId === EBALLARD_USER_ID) &&
      !fileShareStillPresent.some((r) => r.sharedUserId === EBALLARD_USER_ID) &&
      afterRevokeJoshua.tasks === beforeJoshua.tasks &&
      afterRevokeJoshua.files === beforeJoshua.files;

    return {
      pass,
      emailAudit,
      beforeEballard,
      beforeJoshua,
      sharedTaskId: String(shareTask._id),
      sharedFileId: String(shareFile._id),
      taskShareResult,
      fileShareResult,
      taskShareRow: taskShareRow
        ? {
            permission: taskShareRow.permission,
            sharedUserId: taskShareRow.sharedUserId,
          }
        : null,
      fileShareRow: fileShareRow
        ? {
            permission: fileShareRow.permission,
            sharedUserId: fileShareRow.sharedUserId,
          }
        : null,
      pipelineLegacyShare: pipelineLegacyShare
        ? { access: pipelineLegacyShare.access, userKey: pipelineLegacyShare.userKey }
        : null,
      afterTaskShareEballard,
      afterBothShareEballard,
      afterRevokeEballard,
      afterRevokeJoshua,
      taskAccessLevel,
      fileAccessLevel,
      taskEditDenied,
      fileEditAllowed,
      taskRevoke,
      fileRevoke,
    };
  },
});
