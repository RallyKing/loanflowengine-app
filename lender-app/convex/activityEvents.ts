import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertOrgPermission } from "./organizationRbac";
import { assertOrganizationId } from "./organizationValidators";
import { resolveMemberUserKey } from "./organizationAccess";
import { resolveDisplayUsernameMap } from "./auth/displayIdentity";
import {
  normalizeActorKey,
  ensureWritableOrgFeedScope,
  scopeFromPipelineFile,
  scopeFromContact,
  scopeFromLender,
} from "./activityFeed";

const eventTypeV = v.union(
  v.literal("file_created"),
  v.literal("file_updated"),
  v.literal("status_changed"),
  v.literal("task_assigned"),
  v.literal("task_completed"),
  v.literal("comment_added"),
  v.literal("document_uploaded"),
  v.literal("lender_interaction_created"),
  v.literal("note_edited"),
  v.literal("ownership_changed"),
  v.literal("deadline_changed"),
  v.literal("assignment_changed"),
  v.literal("communication_sent"),
  v.literal("communication_delivered"),
  v.literal("communication_failed"),
  v.literal("communication_retry_scheduled"),
  v.literal("presence_hint"),
);

const visibilityV = v.union(
  v.literal("org_wide"),
  v.literal("entity_participants"),
  v.literal("direct_recipients"),
  v.literal("internal_admin"),
);

async function mirrorCollaborationRowToActivityFeed(
  ctx: MutationCtx,
  row: Doc<"collaborationActivityEvents">,
): Promise<void> {
  if (row.eventType === "presence_hint") return;

  let scope: { kind: "org" | "user"; id: string } | null = null;
  let category: Doc<"activityFeed">["category"] = "file";
  const kind = `collaboration.${row.eventType}`;
  const fileId = row.pipelineFileId;
  const contactId = row.contactId;
  const lenderId = row.lenderId;
  let taskId = row.taskId;

  if (row.pipelineFileId) {
    const file = await ctx.db.get(row.pipelineFileId);
    if (file) {
      scope = scopeFromPipelineFile(file, row.actorUserKey);
      category = "file";
    }
  } else if (row.taskId) {
    const task = await ctx.db.get(row.taskId);
    if (task) {
      category = "task";
      taskId = task._id;
      if (task.relatedFileId) {
        const file = await ctx.db.get(task.relatedFileId);
        if (file) scope = scopeFromPipelineFile(file, row.actorUserKey);
      }
    }
  } else if (row.lenderId) {
    const lender = await ctx.db.get(row.lenderId);
    if (lender) {
      scope = scopeFromLender(lender, row.actorUserKey);
      category = "lender";
    }
  } else if (row.contactId) {
    const contact = await ctx.db.get(row.contactId);
    if (contact) {
      scope = scopeFromContact(contact, row.actorUserKey);
      category = "contact";
    }
  } else if (row.libraryDocumentId) {
    category = "file";
    scope = { kind: "org", id: row.organizationId as string };
  } else {
    scope = { kind: "org", id: row.organizationId as string };
  }

  if (!scope) return;
  if (!(await ensureWritableOrgFeedScope(ctx, scope))) return;

  const detail =
    row.delta == null
      ? undefined
      : JSON.stringify(row.delta).slice(0, 2000);

  await ctx.db.insert("activityFeed", {
    at: row.at,
    scopeKind: scope.kind,
    scopeId: scope.id,
    category,
    kind,
    summary: row.summary,
    ...(detail ? { detail } : {}),
    actorKey: normalizeActorKey(row.actorUserKey),
    ...(fileId ? { fileId } : {}),
    ...(contactId ? { contactId } : {}),
    ...(lenderId ? { lenderId } : {}),
    ...(taskId ? { taskId } : {}),
  });
}

export async function insertCollaborationActivityEvent(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    eventType: Doc<"collaborationActivityEvents">["eventType"];
    visibility: Doc<"collaborationActivityEvents">["visibility"];
    actorUserKey: string;
    summary: string;
    delta?: unknown;
    recipientUserKeys?: string[];
    pipelineFileId?: Id<"pipeline">;
    taskId?: Id<"tasks">;
    lenderId?: Id<"lenders">;
    libraryDocumentId?: Id<"libraryDocuments">;
    contactId?: Id<"contacts">;
    collaborationThreadId?: Id<"collaborationThreads">;
    at?: number;
    mirrorToFeed?: boolean;
  },
): Promise<Id<"collaborationActivityEvents">> {
  const at = args.at ?? Date.now();
  const actorKey = args.actorUserKey.trim();
  const summary = args.summary.slice(0, 500);

  /** Batch cosmetic bursts: same file + actor + type within 12s. */
  const cosmeticTypes = new Set<
    Doc<"collaborationActivityEvents">["eventType"]
  >([
    "file_updated",
    "note_edited",
    "status_changed",
    "deadline_changed",
    "assignment_changed",
  ]);
  if (args.pipelineFileId && cosmeticTypes.has(args.eventType)) {
    const recent = await ctx.db
      .query("collaborationActivityEvents")
      .withIndex("by_org_file_at", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("pipelineFileId", args.pipelineFileId!),
      )
      .order("desc")
      .take(6);
    const dupe = recent.find(
      (row) =>
        row.eventType === args.eventType &&
        row.actorUserKey === actorKey &&
        row.summary === summary &&
        at - row.at < 12_000,
    );
    if (dupe) return dupe._id;
  }

  const id = await ctx.db.insert("collaborationActivityEvents", {
    organizationId: args.organizationId,
    at,
    eventType: args.eventType,
    visibility: args.visibility,
    actorUserKey: actorKey,
    summary,
    ...(args.delta !== undefined ? { delta: args.delta } : {}),
    ...(args.recipientUserKeys?.length
      ? { recipientUserKeys: args.recipientUserKeys }
      : {}),
    ...(args.pipelineFileId ? { pipelineFileId: args.pipelineFileId } : {}),
    ...(args.taskId ? { taskId: args.taskId } : {}),
    ...(args.lenderId ? { lenderId: args.lenderId } : {}),
    ...(args.libraryDocumentId
      ? { libraryDocumentId: args.libraryDocumentId }
      : {}),
    ...(args.contactId ? { contactId: args.contactId } : {}),
    ...(args.collaborationThreadId
      ? { collaborationThreadId: args.collaborationThreadId }
      : {}),
  });

  if (args.mirrorToFeed !== false) {
    const row = await ctx.db.get(id);
    if (row) await mirrorCollaborationRowToActivityFeed(ctx, row);
  }
  return id;
}

export const record = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
    eventType: eventTypeV,
    visibility: visibilityV,
    summary: v.string(),
    delta: v.optional(v.any()),
    recipientUserKeys: v.optional(v.array(v.string())),
    pipelineFileId: v.optional(v.id("pipeline")),
    taskId: v.optional(v.id("tasks")),
    lenderId: v.optional(v.id("lenders")),
    libraryDocumentId: v.optional(v.id("libraryDocuments")),
    contactId: v.optional(v.id("contacts")),
    collaborationThreadId: v.optional(v.id("collaborationThreads")),
    mirrorToFeed: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      memberUserKey,
      organizationId,
      eventType,
      visibility,
      summary,
      delta,
      recipientUserKeys,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
      contactId,
      collaborationThreadId,
      mirrorToFeed,
    },
  ) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, key, "files.view");
    if (visibility === "internal_admin") {
      await assertOrgPermission(ctx, orgId, key, "settings.access");
    }
    return await insertCollaborationActivityEvent(ctx, {
      organizationId,
      eventType,
      visibility,
      actorUserKey: key,
      summary,
      delta,
      recipientUserKeys,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
      contactId,
      collaborationThreadId,
      mirrorToFeed,
    });
  },
});

export const listForOrganization = query({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    eventType: v.optional(eventTypeV),
  },
  handler: async (
    ctx,
    { memberUserKey, organizationId, limit, eventType },
  ) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, key, "files.view");
    const cap = Math.min(Math.max(limit ?? 40, 1), 120);

    const qish = ctx.db
      .query("collaborationActivityEvents")
      .withIndex("by_org_at", (qi) => qi.eq("organizationId", organizationId))
      .order("desc");

    const rows = await qish.take(cap * 2);
    const isAdmin = await (async () => {
      try {
        await assertOrgPermission(ctx, orgId, key, "settings.access");
        return true;
      } catch {
        return false;
      }
    })();

    const filtered = rows.filter((r) => {
      if (r.visibility === "internal_admin" && !isAdmin) return false;
      if (eventType && r.eventType !== eventType) return false;
      if (r.visibility === "direct_recipients" && r.recipientUserKeys?.length) {
        if (!r.recipientUserKeys.includes(key)) return false;
      }
      return true;
    });
    const slice = filtered.slice(0, cap);
    const labelMap = await resolveDisplayUsernameMap(
      ctx,
      slice.map((r) => r.actorUserKey),
    );
    return slice.map((r) => ({
      ...r,
      actorDisplayUsername: labelMap[r.actorUserKey] ?? r.actorUserKey,
    }));
  },
});

/**
 * Filtered collaboration stream for operational dashboards (Phase 10).
 * Prefer `by_org_file_at` when `pipelineFileId` is set to stay index-friendly.
 */
export const listOperationalStream = query({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    actorUserKey: v.optional(v.string()),
    pipelineFileId: v.optional(v.id("pipeline")),
    lenderId: v.optional(v.id("lenders")),
    contactId: v.optional(v.id("contacts")),
    taskId: v.optional(v.id("tasks")),
    sinceAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    {
      memberUserKey,
      organizationId,
      limit,
      actorUserKey,
      pipelineFileId,
      lenderId,
      contactId,
      taskId,
      sinceAt,
    },
  ) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, key, "files.view");
    const cap = Math.min(Math.max(limit ?? 48, 1), 150);
    const since = sinceAt ?? 0;
    const actorF = actorUserKey?.trim();

    const batch = pipelineFileId
      ? await ctx.db
          .query("collaborationActivityEvents")
          .withIndex("by_org_file_at", (qi) =>
            qi
              .eq("organizationId", organizationId)
              .eq("pipelineFileId", pipelineFileId),
          )
          .order("desc")
          .take(cap * 4)
      : await ctx.db
          .query("collaborationActivityEvents")
          .withIndex("by_org_at", (qi) =>
            qi.eq("organizationId", organizationId),
          )
          .order("desc")
          .take(cap * 4);

    const isAdmin = await (async () => {
      try {
        await assertOrgPermission(ctx, orgId, key, "settings.access");
        return true;
      } catch {
        return false;
      }
    })();

    const filtered = batch.filter((r) => {
      if (r.at < since) return false;
      if (r.visibility === "internal_admin" && !isAdmin) return false;
      if (actorF && r.actorUserKey !== actorF) return false;
      if (lenderId && r.lenderId !== lenderId) return false;
      if (contactId && r.contactId !== contactId) return false;
      if (taskId && r.taskId !== taskId) return false;
      if (r.visibility === "direct_recipients" && r.recipientUserKeys?.length) {
        if (!r.recipientUserKeys.includes(key)) return false;
      }
      return true;
    });
    return filtered.slice(0, cap);
  },
});

export const internalAppendSystemEvent = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    eventType: eventTypeV,
    visibility: visibilityV,
    actorUserKey: v.string(),
    summary: v.string(),
    delta: v.optional(v.any()),
    pipelineFileId: v.optional(v.id("pipeline")),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    await insertCollaborationActivityEvent(ctx, {
      organizationId: args.organizationId,
      eventType: args.eventType,
      visibility: args.visibility,
      actorUserKey: args.actorUserKey,
      summary: args.summary,
      delta: args.delta,
      pipelineFileId: args.pipelineFileId,
      taskId: args.taskId,
      mirrorToFeed: true,
    });
  },
});
