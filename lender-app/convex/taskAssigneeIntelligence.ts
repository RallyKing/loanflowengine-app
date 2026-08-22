import { query } from "./_generated/server";
import { v } from "convex/values";
import { assertOrganizationId } from "./organizationValidators";
import { assertOrgMember, resolveMemberUserKey } from "./organizationAccess";

/**
 * Heuristic assignee recommendations from live workload + file affinity (Phase 10).
 */
export const suggestAssignees = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    relatedFileId: v.optional(v.id("pipeline")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const key = await resolveMemberUserKey(ctx, args.memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, args.organizationId);
    await assertOrgMember(ctx, orgId, key);

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(2_800);

    const open = tasks.filter(
      (t) => t.status !== "done" && t.status !== "archived",
    );
    const countByAssignee = new Map<string, number>();
    const priorityLoad = new Map<string, number>();
    for (const t of open) {
      const a = t.assigneeId?.trim();
      if (!a) continue;
      countByAssignee.set(a, (countByAssignee.get(a) ?? 0) + 1);
      priorityLoad.set(
        a,
        (priorityLoad.get(a) ?? 0) + Math.max(0, t.priority ?? 0),
      );
    }

    const fileAffinity = new Set<string>();
    if (args.relatedFileId) {
      for (const t of open) {
        if (
          t.relatedFileId === args.relatedFileId &&
          t.assigneeId?.trim()
        ) {
          fileAffinity.add(t.assigneeId.trim());
        }
      }
    }

    const cap = Math.min(Math.max(args.limit ?? 8, 1), 24);
    const scored = members
      .map((m) => {
        const uk = m.userKey.trim();
        const load = countByAssignee.get(uk) ?? 0;
        const psum = priorityLoad.get(uk) ?? 0;
        let score =
          100 - Math.min(load * 6, 72) - Math.min(psum * 0.12, 18);
        if (fileAffinity.has(uk)) score += 14;
        const overload = load >= 18;
        const idleCapacity = load <= 3;
        return {
          userKey: uk,
          tenantRole: m.role,
          openTaskCount: load,
          score,
          overload,
          idleCapacity,
          fileAffinity: fileAffinity.has(uk),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, cap);

    return { suggestions: scored };
  },
});

export const teamWorkloadSummary = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = await resolveMemberUserKey(ctx, args.memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, args.organizationId);
    await assertOrgMember(ctx, orgId, key);

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(2_800);

    const open = tasks.filter(
      (t) => t.status !== "done" && t.status !== "archived",
    );
    const unassigned = open.filter((t) => !t.assigneeId?.trim()).length;
    const byAssignee = new Map<string, number>();
    for (const t of open) {
      const a = t.assigneeId?.trim();
      if (!a) continue;
      byAssignee.set(a, (byAssignee.get(a) ?? 0) + 1);
    }
    let maxLoad = 0;
    let minLoad = Number.POSITIVE_INFINITY;
    for (const n of byAssignee.values()) {
      maxLoad = Math.max(maxLoad, n);
      minLoad = Math.min(minLoad, n);
    }
    if (!byAssignee.size) minLoad = 0;

    return {
      openTaskCount: open.length,
      unassignedOpenTasks: unassigned,
      assigneeCount: byAssignee.size,
      maxOpenPerAssignee: maxLoad,
      minOpenPerAssignee: Number.isFinite(minLoad) ? minLoad : 0,
      imbalance:
        maxLoad > 0 && Number.isFinite(minLoad)
          ? Math.max(0, maxLoad - minLoad)
          : 0,
    };
  },
});
