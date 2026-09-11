import { query } from "./_generated/server";
import { v } from "convex/values";
import { assertOrgPermission } from "./organizationRbac";
import { assertOrganizationId } from "./organizationValidators";
import { resolveMemberUserKey } from "./organizationAccess";
import { resolveTriageEvaluationTime } from "../lib/triageClock";

/**
 * Aggregated org snapshot for `/operations` nerve-center (Phase 10).
 */
export const operationsSnapshot = query({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
    /** Minute bucket from `TriageClockProvider` — never Date.now() in this query. */
    nowBucket: v.optional(v.number()),
  },
  handler: async (ctx, { memberUserKey, organizationId, nowBucket }) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, key, "files.view");

    const now = resolveTriageEvaluationTime(nowBucket);
    const presenceCandidates = await ctx.db
      .query("memberPresence")
      .withIndex("by_org_expires", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(250);
    const presenceRows = presenceCandidates.filter((r) => r.expiresAt > now);

    const activeUsers = new Set(presenceRows.map((r) => r.userKey)).size;
    const occupiedFiles = new Set(
      presenceRows
        .map((r) => r.pipelineFileId)
        .filter((id): id is NonNullable<typeof id> => id != null),
    ).size;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(2_500);

    const open = tasks.filter(
      (t) => t.status !== "done" && t.status !== "archived",
    );
    const aging = open.filter(
      (t) =>
        typeof t.dueDate === "number" &&
        t.dueDate > 0 &&
        t.dueDate < now - 86_400_000 * 3,
    ).length;

    const events = await ctx.db
      .query("collaborationActivityEvents")
      .withIndex("by_org_at", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(12);

    return {
      generatedAt: now,
      activeUsers,
      occupiedFiles,
      rawPresenceCount: presenceRows.length,
      openTasks: open.length,
      agingTasks: aging,
      recentEvents: events,
    };
  },
});
