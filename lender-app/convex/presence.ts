import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOrgPermission } from "./organizationRbac";
import { assertOrganizationId } from "./organizationValidators";
import { resolveMemberUserKey } from "./organizationAccess";

const PRESENCE_TTL_MS = 90_000;

const statusV = v.union(
  v.literal("online"),
  v.literal("viewing_file"),
  v.literal("editing_file"),
  v.literal("idle"),
  v.literal("away"),
  v.literal("typing"),
);

const workspaceSurfaceV = v.union(
  v.literal("pipeline_drawer"),
  v.literal("file_messages"),
  v.literal("lenders_panel"),
  v.literal("documents"),
  v.literal("comments"),
  v.literal("tasks_panel"),
  v.literal("financial_terms"),
  v.literal("assignment"),
  v.literal("hub"),
);

export const heartbeat = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
    status: statusV,
    pipelineFileId: v.optional(v.id("pipeline")),
    collaborationThreadId: v.optional(v.id("collaborationThreads")),
    tabSessionId: v.optional(v.string()),
    workspaceSurface: v.optional(workspaceSurfaceV),
    surfaceKey: v.optional(v.string()),
    observationOnly: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      memberUserKey,
      organizationId,
      status,
      pipelineFileId,
      collaborationThreadId,
      tabSessionId,
      workspaceSurface,
      surfaceKey,
      observationOnly,
    },
  ) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, key, "files.view");

    const now = Date.now();
    const expiresAt = now + PRESENCE_TTL_MS;

    const existing = await ctx.db
      .query("memberPresence")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userKey", key),
      )
      .first();

    const patch = {
      status,
      pipelineFileId,
      collaborationThreadId,
      tabSessionId: tabSessionId?.trim() || undefined,
      workspaceSurface,
      surfaceKey: surfaceKey?.trim().slice(0, 200) || undefined,
      observationOnly: observationOnly === true ? true : undefined,
      updatedAt: now,
      expiresAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("memberPresence", {
      organizationId,
      userKey: key,
      ...patch,
    });
  },
});

export const clearForUser = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { memberUserKey, organizationId }) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, key, "files.view");
    const row = await ctx.db
      .query("memberPresence")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userKey", key),
      )
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});

export const listActiveInOrganization = query({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
    pipelineFileId: v.optional(v.id("pipeline")),
  },
  handler: async (ctx, { memberUserKey, organizationId, pipelineFileId }) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, key, "files.view");
    const now = Date.now();
    let rows = await ctx.db
      .query("memberPresence")
      .withIndex("by_org_expires", (q) =>
        q.eq("organizationId", organizationId),
      )
      .filter((qq) => qq.gt(qq.field("expiresAt"), now))
      .take(200);
    if (pipelineFileId) {
      rows = rows.filter(
        (r) =>
          r.pipelineFileId === pipelineFileId &&
          r.status !== "away" &&
          r.status !== "idle",
      );
    }
    return rows;
  },
});

export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query("memberPresence").take(1500);
    let removed = 0;
    for (const r of rows) {
      if (r.expiresAt < now) {
        await ctx.db.delete(r._id);
        removed += 1;
      }
    }
    return { removed };
  },
});
