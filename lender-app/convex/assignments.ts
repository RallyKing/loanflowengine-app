import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrgPermission } from "./organizationRbac";
import { assertOrganizationId } from "./organizationValidators";
import { resolveMemberUserKey } from "./organizationAccess";
import { dispatchUserNotification } from "./notifications";
import { insertCollaborationActivityEvent } from "./activityEvents";

const entityKindV = v.union(
  v.literal("pipeline_file"),
  v.literal("task"),
  v.literal("lender"),
  v.literal("library_document"),
);

const roleV = v.union(
  v.literal("owner"),
  v.literal("assignee"),
  v.literal("watcher"),
  v.literal("follower"),
  v.literal("reviewer"),
  v.literal("approver"),
);

function assertEntityKeyMatches(
  kind: Doc<"entityAssignments">["entityKind"],
  pipelineFileId: Id<"pipeline"> | undefined,
  taskId: Id<"tasks"> | undefined,
  lenderId: Id<"lenders"> | undefined,
  libraryDocumentId: Id<"libraryDocuments"> | undefined,
) {
  if (kind === "pipeline_file" && !pipelineFileId) {
    throw new Error("pipelineFileId required for pipeline_file assignment.");
  }
  if (kind === "task" && !taskId) {
    throw new Error("taskId required for task assignment.");
  }
  if (kind === "lender" && !lenderId) {
    throw new Error("lenderId required for lender assignment.");
  }
  if (kind === "library_document" && !libraryDocumentId) {
    throw new Error("libraryDocumentId required for library_document assignment.");
  }
}

export const upsert = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
    entityKind: entityKindV,
    role: roleV,
    userKey: v.string(),
    pipelineFileId: v.optional(v.id("pipeline")),
    taskId: v.optional(v.id("tasks")),
    lenderId: v.optional(v.id("lenders")),
    libraryDocumentId: v.optional(v.id("libraryDocuments")),
    note: v.optional(v.string()),
    notify: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      memberUserKey,
      organizationId,
      entityKind,
      role,
      userKey,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
      note,
      notify,
    },
  ) => {
    const actor = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, actor, "files.edit");

    assertEntityKeyMatches(
      entityKind,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
    );

    if (role === "owner" && entityKind === "pipeline_file" && pipelineFileId) {
      const owners = await ctx.db
        .query("entityAssignments")
        .withIndex("by_org_file", (q) =>
          q.eq("organizationId", organizationId).eq("pipelineFileId", pipelineFileId),
        )
        .filter((qq) => qq.eq(qq.field("revokedAt"), undefined))
        .collect();
      for (const row of owners) {
        if (row.role === "owner" && row.userKey !== userKey.trim()) {
          await ctx.db.patch(row._id, { revokedAt: Date.now() });
        }
      }
    }

    const existing = await findActiveAssignment(ctx, {
      organizationId,
      entityKind,
      role,
      userKey: userKey.trim(),
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
    });

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        note: note?.trim() || existing.note,
        assignedAt: now,
        assignedByUserKey: actor,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("entityAssignments", {
      organizationId,
      entityKind,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
      role,
      userKey: userKey.trim(),
      assignedByUserKey: actor,
      assignedAt: now,
      note: note?.trim() || undefined,
    });

    await insertCollaborationActivityEvent(ctx, {
      organizationId,
      eventType: "assignment_changed",
      visibility: "entity_participants",
      actorUserKey: actor,
      summary: `Assignment: ${role} → ${userKey.trim()}`,
      delta: { entityKind, role, assignmentId: id },
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
      recipientUserKeys: [userKey.trim()],
    });

    if (notify !== false && userKey.trim() !== actor) {
      await dispatchUserNotification(ctx, {
        userKey: userKey.trim(),
        category: "assignment_change",
        summary: `You were assigned as ${role}`,
        detail: note,
        actorUserKey: actor,
        taskId,
        fileId: pipelineFileId,
        lenderId,
        libraryDocumentId,
        dedupeKey: `assign:${organizationId}:${entityKind}:${userKey.trim()}:${role}:${pipelineFileId ?? taskId ?? lenderId ?? libraryDocumentId}`,
      });
    }

    return id;
  },
});

async function findActiveAssignment(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    entityKind: Doc<"entityAssignments">["entityKind"];
    role: Doc<"entityAssignments">["role"];
    userKey: string;
    pipelineFileId?: Id<"pipeline">;
    taskId?: Id<"tasks">;
    lenderId?: Id<"lenders">;
    libraryDocumentId?: Id<"libraryDocuments">;
  },
) {
  if (args.entityKind === "pipeline_file" && args.pipelineFileId) {
    const rows = await ctx.db
      .query("entityAssignments")
      .withIndex("by_org_file", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("pipelineFileId", args.pipelineFileId),
      )
      .filter((qq) => qq.eq(qq.field("revokedAt"), undefined))
      .collect();
    return rows.find(
      (r) => r.userKey === args.userKey && r.role === args.role,
    );
  }
  if (args.entityKind === "task" && args.taskId) {
    const rows = await ctx.db
      .query("entityAssignments")
      .withIndex("by_org_task", (q) =>
        q.eq("organizationId", args.organizationId).eq("taskId", args.taskId),
      )
      .filter((qq) => qq.eq(qq.field("revokedAt"), undefined))
      .collect();
    return rows.find(
      (r) => r.userKey === args.userKey && r.role === args.role,
    );
  }
  if (args.entityKind === "lender" && args.lenderId) {
    const rows = await ctx.db
      .query("entityAssignments")
      .withIndex("by_org_lender", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("lenderId", args.lenderId),
      )
      .filter((qq) => qq.eq(qq.field("revokedAt"), undefined))
      .collect();
    return rows.find(
      (r) => r.userKey === args.userKey && r.role === args.role,
    );
  }
  if (args.entityKind === "library_document" && args.libraryDocumentId) {
    const rows = await ctx.db
      .query("entityAssignments")
      .withIndex("by_org_library_doc", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("libraryDocumentId", args.libraryDocumentId),
      )
      .filter((qq) => qq.eq(qq.field("revokedAt"), undefined))
      .collect();
    return rows.find(
      (r) => r.userKey === args.userKey && r.role === args.role,
    );
  }
  return undefined;
}

export const revoke = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    assignmentId: v.id("entityAssignments"),
  },
  handler: async (ctx, { memberUserKey, assignmentId }) => {
    const actor = await resolveMemberUserKey(ctx, memberUserKey);
    const row = await ctx.db.get(assignmentId);
    if (!row) throw new Error("Assignment not found.");
    const { id: orgId } = await assertOrganizationId(ctx, row.organizationId);
    await assertOrgPermission(ctx, orgId, actor, "files.edit");
    await ctx.db.patch(assignmentId, { revokedAt: Date.now() });
    await insertCollaborationActivityEvent(ctx, {
      organizationId: row.organizationId,
      eventType: "assignment_changed",
      visibility: "entity_participants",
      actorUserKey: actor,
      summary: `Assignment revoked (${row.role})`,
      delta: { revoked: assignmentId },
      pipelineFileId: row.pipelineFileId,
      taskId: row.taskId,
      lenderId: row.lenderId,
      libraryDocumentId: row.libraryDocumentId,
    });
  },
});

export const listForEntity = query({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
    entityKind: entityKindV,
    pipelineFileId: v.optional(v.id("pipeline")),
    taskId: v.optional(v.id("tasks")),
    lenderId: v.optional(v.id("lenders")),
    libraryDocumentId: v.optional(v.id("libraryDocuments")),
  },
  handler: async (
    ctx,
    {
      memberUserKey,
      organizationId,
      entityKind,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
    },
  ) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, key, "files.view");
    assertEntityKeyMatches(
      entityKind,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
    );

    if (entityKind === "pipeline_file" && pipelineFileId) {
      return await ctx.db
        .query("entityAssignments")
        .withIndex("by_org_file", (q) =>
          q.eq("organizationId", organizationId).eq("pipelineFileId", pipelineFileId),
        )
        .filter((qq) => qq.eq(qq.field("revokedAt"), undefined))
        .collect();
    }
    if (entityKind === "task" && taskId) {
      return await ctx.db
        .query("entityAssignments")
        .withIndex("by_org_task", (q) =>
          q.eq("organizationId", organizationId).eq("taskId", taskId),
        )
        .filter((qq) => qq.eq(qq.field("revokedAt"), undefined))
        .collect();
    }
    if (entityKind === "lender" && lenderId) {
      return await ctx.db
        .query("entityAssignments")
        .withIndex("by_org_lender", (q) =>
          q.eq("organizationId", organizationId).eq("lenderId", lenderId),
        )
        .filter((qq) => qq.eq(qq.field("revokedAt"), undefined))
        .collect();
    }
    if (entityKind === "library_document" && libraryDocumentId) {
      return await ctx.db
        .query("entityAssignments")
        .withIndex("by_org_library_doc", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("libraryDocumentId", libraryDocumentId),
        )
        .filter((qq) => qq.eq(qq.field("revokedAt"), undefined))
        .collect();
    }
    return [];
  },
});
