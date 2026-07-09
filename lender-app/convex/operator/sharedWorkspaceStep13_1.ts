/**
 * Phase 13.1 — shared workspace live proof (feed composition on resourceShares).
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  filterPipelineRowsForMember,
  filterTaskRowsForMember,
  upsertResourceShare,
  removeResourceShare,
} from "../resourceAccess";
import {
  buildSharedFeedList,
  type SharedFeedRow,
} from "../sharedWorkspace";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const JOSHUA_USER_ID = "ts719yfyv2b6020avvctpw0ns586exm6";
const EBALLARD_USER_ID = "ts7d3keadq48gay3pa8k6gdwx9878p33";
const TARGET_EMAIL = "joshuaeballard@gmail.com";

async function feedCount(
  ctx: MutationCtx,
  mode: "with_me" | "by_me",
  memberUserKey: string,
  options?: {
    resourceType?: "task" | "pipeline";
    resourceId?: string;
    sharedUserId?: string;
  },
): Promise<{ count: number; rows: SharedFeedRow[] }> {
  const rows = await buildSharedFeedList(ctx, {
    organizationId: JOSHUA_ORG_ID,
    memberUserKey,
    mode,
  });
  let filtered = rows;
  if (options?.resourceType) {
    filtered = filtered.filter((r) => r.resourceType === options.resourceType);
  }
  if (options?.resourceId) {
    filtered = filtered.filter((r) => r.resourceId === options.resourceId);
  }
  if (options?.sharedUserId) {
    filtered = filtered.filter((r) => r.sharedUserId === options.sharedUserId);
  }
  return { count: filtered.length, rows: filtered };
}

export const runSharedWorkspaceLiveProof = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);

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
      throw new Error("Joshua must own at least one task and one file.");
    }

    const cleanup = async () => {
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
    };
    await cleanup();

    const taskId = String(shareTask._id);
    const fileId = String(shareFile._id);
    const proofScope = {
      sharedUserId: EBALLARD_USER_ID,
    };

    const matrixA = await feedCount(ctx, "with_me", EBALLARD_USER_ID, {
      ...proofScope,
      resourceId: taskId,
      resourceType: "task",
    });

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "task",
      resourceId: taskId,
      sharedUserId: EBALLARD_USER_ID,
      permission: "view",
      createdByUserId: JOSHUA_USER_ID,
    });
    const matrixB = await feedCount(ctx, "with_me", EBALLARD_USER_ID, {
      ...proofScope,
      resourceId: taskId,
      resourceType: "task",
    });
    const joshuaByMeB = await feedCount(ctx, "by_me", JOSHUA_USER_ID, {
      ...proofScope,
      resourceId: taskId,
      resourceType: "task",
    });

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "task",
      resourceId: taskId,
      sharedUserId: EBALLARD_USER_ID,
      permission: "edit",
      createdByUserId: JOSHUA_USER_ID,
    });
    const matrixC = await feedCount(ctx, "with_me", EBALLARD_USER_ID, {
      ...proofScope,
      resourceId: taskId,
      resourceType: "task",
    });
    const joshuaByMeC = await feedCount(ctx, "by_me", JOSHUA_USER_ID, {
      ...proofScope,
      resourceId: taskId,
      resourceType: "task",
    });

    await removeResourceShare(ctx, {
      resourceType: "task",
      resourceId: taskId,
      sharedUserId: EBALLARD_USER_ID,
    });
    const matrixTaskRevoke = await feedCount(ctx, "with_me", EBALLARD_USER_ID, {
      ...proofScope,
      resourceId: taskId,
      resourceType: "task",
    });

    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "pipeline",
      resourceId: fileId,
      sharedUserId: EBALLARD_USER_ID,
      permission: "view",
      createdByUserId: JOSHUA_USER_ID,
    });
    const matrixDView = await feedCount(ctx, "with_me", EBALLARD_USER_ID, {
      ...proofScope,
      resourceId: fileId,
      resourceType: "pipeline",
    });
    await upsertResourceShare(ctx, {
      organizationId: JOSHUA_ORG_ID,
      resourceType: "pipeline",
      resourceId: fileId,
      sharedUserId: EBALLARD_USER_ID,
      permission: "edit",
      createdByUserId: JOSHUA_USER_ID,
    });
    const matrixDEdit = await feedCount(ctx, "with_me", EBALLARD_USER_ID, {
      ...proofScope,
      resourceId: fileId,
      resourceType: "pipeline",
    });
    await removeResourceShare(ctx, {
      resourceType: "pipeline",
      resourceId: fileId,
      sharedUserId: EBALLARD_USER_ID,
    });
    const matrixDRevoke = await feedCount(ctx, "with_me", EBALLARD_USER_ID, {
      ...proofScope,
      resourceId: fileId,
      resourceType: "pipeline",
    });

    const joshuaByMeFinal = await feedCount(ctx, "by_me", JOSHUA_USER_ID, {
      ...proofScope,
      resourceId: fileId,
      resourceType: "pipeline",
    });

    const pass =
      matrixA.count === 0 &&
      matrixB.count === 1 &&
      matrixB.rows[0]?.permission === "view" &&
      joshuaByMeB.count === 1 &&
      matrixC.count === 1 &&
      matrixC.rows[0]?.permission === "edit" &&
      joshuaByMeC.count === 1 &&
      joshuaByMeC.rows[0]?.permission === "edit" &&
      matrixTaskRevoke.count === 0 &&
      matrixDView.count === 1 &&
      matrixDView.rows[0]?.permission === "view" &&
      matrixDEdit.count === 1 &&
      matrixDEdit.rows[0]?.permission === "edit" &&
      matrixDRevoke.count === 0 &&
      joshuaByMeFinal.count === 0;

    return {
      pass,
      sharedTaskId: String(shareTask._id),
      sharedFileId: String(shareFile._id),
      targetEmail: TARGET_EMAIL,
      matrix: {
        A: matrixA,
        B: { eballard: matrixB, joshuaByMe: joshuaByMeB },
        C: { eballard: matrixC, joshuaByMe: joshuaByMeC },
        taskRevoke: matrixTaskRevoke,
        D: {
          view: matrixDView,
          edit: matrixDEdit,
          revoke: matrixDRevoke,
        },
        E: { joshuaByMeFinal },
      },
    };
  },
});
