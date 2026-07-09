/**
 * Phase 12.2 Step 8B — owner backfill, share migration, live ACL proof.
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  filterPipelineRowsForMember,
  filterTaskRowsForMember,
  ownerFieldsForInsert,
  removeResourceShare,
  resolvePipelineAccessLevel,
  resolveRowOwnerUserId,
  resolveTaskAccessLevel,
  upsertResourceShare,
  assertCanMutateTaskRow,
  assertCanMutatePipelineRow,
} from "../resourceAccess";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";

const EXPECTED_TASKS = 56;
const EXPECTED_FILES = 11;

async function countOwnership(ctx: QueryCtx | MutationCtx) {
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

  const tasksOwnedByJoshua = tasks.filter(
    (t) => resolveRowOwnerUserId(t) === JOSHUA_USER_ID,
  ).length;
  const filesOwnedByJoshua = files.filter(
    (f) => resolveRowOwnerUserId(f) === JOSHUA_USER_ID,
  ).length;
  const nullTaskOwners = tasks.filter((t) => !resolveRowOwnerUserId(t)).length;
  const nullFileOwners = files.filter((f) => !resolveRowOwnerUserId(f)).length;
  const taskOwnerDrift = tasks.filter(
    (t) => {
      const o = resolveRowOwnerUserId(t);
      return o && o !== JOSHUA_USER_ID;
    },
  ).length;
  const fileOwnerDrift = files.filter(
    (f) => {
      const o = resolveRowOwnerUserId(f);
      return o && o !== JOSHUA_USER_ID;
    },
  ).length;

  return {
    joshuaOrgTaskCount: tasks.length,
    joshuaOrgFileCount: files.length,
    tasksOwnedByJoshua,
    filesOwnedByJoshua,
    nullTaskOwners,
    nullFileOwners,
    taskOwnerDrift,
    fileOwnerDrift,
  };
}

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

async function auditShareIntegrity(ctx: QueryCtx | MutationCtx) {
  const legacy = await ctx.db.query("pipelineFileShares").collect();
  const orgFiles = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", JOSHUA_ORG_ID),
    )
    .collect();
  const orgFileIds = new Set(orgFiles.map((f) => String(f._id)));

  const legacyOnJoshuaOrg = legacy.filter((s) => orgFileIds.has(String(s.fileId)));
  const resourceRows = await ctx.db.query("resourceShares").collect();
  const pipelineResourceRows = resourceRows.filter((r) => r.resourceType === "pipeline");

  const errors: string[] = [];
  let legacyShareDrift = 0;

  for (const s of legacyOnJoshuaOrg) {
    const now = Date.now();
    if (s.expiresAtMs != null && s.expiresAtMs <= now) continue;
    const pl = s.permissionLevel;
    const permission: "view" | "edit" =
      s.access === "edit" || pl === "edit" || pl === "manage" ? "edit" : "view";
    const match = pipelineResourceRows.find(
      (r) =>
        r.resourceId === String(s.fileId) &&
        r.sharedUserId === s.userKey &&
        r.permission === permission,
    );
    if (!match) {
      legacyShareDrift++;
      errors.push(`missing resourceShare for legacy file ${s.fileId} user ${s.userKey}`);
    }
  }

  for (const r of pipelineResourceRows) {
    if (r.organizationId !== JOSHUA_ORG_ID) continue;
    if (!orgFileIds.has(r.resourceId)) {
      errors.push(`orphan resourceShare ${r._id} for unknown file ${r.resourceId}`);
    }
  }

  return {
    legacyShareCount: legacyOnJoshuaOrg.length,
    resourceShareCount: pipelineResourceRows.filter(
      (r) => r.organizationId === JOSHUA_ORG_ID,
    ).length,
    legacyShareDrift,
    resourceShareIntegrityErrors: errors.length,
    errors: errors.slice(0, 20),
  };
}

export const auditOwnerAclState = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    const ownership = await countOwnership(ctx);
    const joshuaVisibility = await visibilityCounts(ctx, JOSHUA_USER_ID);
    const eballardVisibility = await visibilityCounts(ctx, EBALLARD_USER_ID);
    const shares = await auditShareIntegrity(ctx);
    return {
      ownership,
      joshuaVisibility,
      eballardVisibility,
      shares,
      expected: { tasks: EXPECTED_TASKS, files: EXPECTED_FILES },
    };
  },
});

export const backfillJoshuaOwnership = mutation({
  args: { adminSecret: v.string(), dryRun: v.boolean() },
  handler: async (ctx, { adminSecret, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);
    const before = await countOwnership(ctx);
    const ownerFields = ownerFieldsForInsert(JOSHUA_USER_ID);
    let tasksPatched = 0;
    let filesPatched = 0;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .collect();
    for (const t of tasks) {
      const current = resolveRowOwnerUserId(t);
      if (current === JOSHUA_USER_ID && t.ownerUserId === JOSHUA_USER_ID) continue;
      tasksPatched++;
      if (!dryRun) {
        await ctx.db.patch(t._id, {
          ownerUserId: JOSHUA_USER_ID,
          updatedAt: Date.now(),
        });
      }
    }

    const files = await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID),
      )
      .collect();
    for (const f of files) {
      const current = resolveRowOwnerUserId(f);
      if (current === JOSHUA_USER_ID && f.ownerUserId === JOSHUA_USER_ID) continue;
      filesPatched++;
      if (!dryRun) {
        await ctx.db.patch(f._id, { ...ownerFields, updatedAt: Date.now() });
      }
    }

    const after = dryRun ? before : await countOwnership(ctx);
    return { dryRun, before, after, tasksPatched, filesPatched };
  },
});

export const migrateLegacyPipelineShares = mutation({
  args: { adminSecret: v.string(), dryRun: v.boolean() },
  handler: async (ctx, { adminSecret, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);
    const before = await auditShareIntegrity(ctx);
    let migrated = 0;

    const legacy = await ctx.db.query("pipelineFileShares").collect();
    for (const s of legacy) {
      const file = await ctx.db.get(s.fileId);
      if (!file?.organizationId || file.organizationId !== JOSHUA_ORG_ID) continue;
      const now = Date.now();
      if (s.expiresAtMs != null && s.expiresAtMs <= now) continue;
      const pl = s.permissionLevel;
      const permission: "view" | "edit" =
        s.access === "edit" || pl === "edit" || pl === "manage" ? "edit" : "view";
      migrated++;
      if (!dryRun) {
        await upsertResourceShare(ctx, {
          organizationId: JOSHUA_ORG_ID,
          resourceType: "pipeline",
          resourceId: String(s.fileId),
          sharedUserId: s.userKey,
          permission,
          createdByUserId: s.createdByUserKey ?? JOSHUA_USER_ID,
        });
      }
    }

    const after = dryRun ? before : await auditShareIntegrity(ctx);
    return { dryRun, before, after, migrated };
  },
});

export const runLiveAclProof = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);

    const beforeJoshua = await visibilityCounts(ctx, JOSHUA_USER_ID);
    const beforeEballard = await visibilityCounts(ctx, EBALLARD_USER_ID);

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

    const joshuaTasks = await filterTaskRowsForMember(ctx, tasks, JOSHUA_ORG_ID, JOSHUA_USER_ID);
    const joshuaFiles = await filterPipelineRowsForMember(
      ctx,
      files,
      JOSHUA_ORG_ID,
      JOSHUA_USER_ID,
    );
    const shareTask = joshuaTasks[0];
    const shareFile = joshuaFiles[0];
    if (!shareTask || !shareFile) {
      throw new Error("Joshua must own at least one task and one file for ACL proof.");
    }

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "task",
      resourceId: String(shareTask._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "view",
      createdByUserId: JOSHUA_USER_ID,
    });
    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "pipeline",
      resourceId: String(shareFile._id),
      sharedUserId: EBALLARD_USER_ID,
      permission: "edit",
      createdByUserId: JOSHUA_USER_ID,
    });

    const afterShareEballard = await visibilityCounts(ctx, EBALLARD_USER_ID);
    const taskLevel = await resolveTaskAccessLevel(ctx, shareTask, EBALLARD_USER_ID);
    const fileLevel = await resolvePipelineAccessLevel(ctx, shareFile, EBALLARD_USER_ID);

    let taskEditDenied = false;
    try {
      await assertCanMutateTaskRow(ctx, shareTask, EBALLARD_USER_ID, "proof_edit");
      taskEditDenied = false;
    } catch {
      taskEditDenied = true;
    }

    let fileEditAllowed = false;
    try {
      await assertCanMutatePipelineRow(ctx, shareFile, EBALLARD_USER_ID, "proof_edit");
      fileEditAllowed = true;
    } catch {
      fileEditAllowed = false;
    }

    await removeResourceShare(ctx, {
      resourceType: "task",
      resourceId: String(shareTask._id),
      sharedUserId: EBALLARD_USER_ID,
    });
    await removeResourceShare(ctx, {
      resourceType: "pipeline",
      resourceId: String(shareFile._id),
      sharedUserId: EBALLARD_USER_ID,
    });

    const afterRevokeEballard = await visibilityCounts(ctx, EBALLARD_USER_ID);
    const afterRevokeJoshua = await visibilityCounts(ctx, JOSHUA_USER_ID);

    const ownership = await countOwnership(ctx);
    const shares = await auditShareIntegrity(ctx);

    const pass =
      beforeJoshua.tasks === EXPECTED_TASKS &&
      beforeJoshua.files === EXPECTED_FILES &&
      beforeEballard.tasks === 0 &&
      beforeEballard.files === 0 &&
      afterShareEballard.tasks === 1 &&
      afterShareEballard.files === 1 &&
      taskEditDenied === true &&
      fileEditAllowed === true &&
      taskLevel === "view" &&
      fileLevel === "edit" &&
      afterRevokeEballard.tasks === 0 &&
      afterRevokeEballard.files === 0 &&
      ownership.nullTaskOwners === 0 &&
      ownership.nullFileOwners === 0 &&
      ownership.taskOwnerDrift === 0 &&
      ownership.fileOwnerDrift === 0 &&
      ownership.tasksOwnedByJoshua === EXPECTED_TASKS &&
      ownership.filesOwnedByJoshua === EXPECTED_FILES &&
      afterRevokeJoshua.tasks === EXPECTED_TASKS &&
      afterRevokeJoshua.files === EXPECTED_FILES;

    return {
      pass,
      sharedTaskId: String(shareTask._id),
      sharedFileId: String(shareFile._id),
      beforeJoshua,
      beforeEballard,
      afterShareEballard,
      afterRevokeEballard,
      afterRevokeJoshua,
      taskAccessLevel: taskLevel,
      fileAccessLevel: fileLevel,
      taskEditDenied,
      fileEditAllowed,
      ownership,
      shares,
    };
  },
});
