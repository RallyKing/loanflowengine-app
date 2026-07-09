import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { assertOrgPermission } from "./organizationRbac";
import {
  authUserHasGlobalAdminElevation,
  tryGetAuthUserByPermissionKey,
} from "./auth/globalAdmin";
import { parseConvexDocumentId } from "../lib/orgIdValidation";

const overrideV = v.object({
  id: v.string(),
  visible: v.optional(v.boolean()),
  order: v.optional(v.number()),
  pinned: v.optional(v.boolean()),
  iconKey: v.optional(v.string()),
});

const quickActionV = v.object({
  id: v.string(),
  label: v.string(),
  href: v.string(),
  catalogId: v.optional(v.string()),
  iconKey: v.optional(v.string()),
  order: v.optional(v.number()),
});

async function latestRowForAccount(
  ctx: QueryCtx | MutationCtx,
  accountId: string,
): Promise<Doc<"navigationUserConfig"> | null> {
  const rows = await ctx.db
    .query("navigationUserConfig")
    .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
    .collect();
  if (rows.length === 0) return null;
  return rows.reduce((best, r) => (r.updatedAt > best.updatedAt ? r : best));
}

export const getByAccountId = query({
  args: {
    accountId: v.string(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { accountId, memberUserKey }) => {
    const t = accountId.trim();
    if (!t) return null;
    const actorKey = memberUserKey?.trim() ?? "";
    const actor = actorKey
      ? await tryGetAuthUserByPermissionKey(ctx, actorKey)
      : null;
    const admin = authUserHasGlobalAdminElevation(actor);
    if (!admin && actorKey !== t) return null;
    return await latestRowForAccount(ctx, t);
  },
});

export const upsert = mutation({
  args: {
    accountId: v.string(),
    memberUserKey: v.optional(v.string()),
    preset: v.union(
      v.literal("admin"),
      v.literal("analyst"),
      v.literal("viewer"),
      v.literal("sales"),
      v.literal("processor"),
      v.literal("manager"),
    ),
    overrides: v.array(overrideV),
    quickActions: v.optional(v.array(quickActionV)),
    syncScope: v.optional(
      v.union(v.literal("cloud"), v.literal("device")),
    ),
    navLayoutMode: v.optional(
      v.union(v.literal("compact"), v.literal("expanded")),
    ),
  },
  handler: async (ctx, args) => {
    const accountId = args.accountId.trim();
    if (!accountId) throw new Error("accountId is required");
    const actorKey = args.memberUserKey?.trim() ?? "";
    const actor = actorKey
      ? await tryGetAuthUserByPermissionKey(ctx, actorKey)
      : null;
    const admin = authUserHasGlobalAdminElevation(actor);
    if (!admin && actorKey !== accountId) {
      throw new Error("Forbidden");
    }
    const now = Date.now();
    const existing = await latestRowForAccount(ctx, accountId);

    const row = {
      accountId,
      updatedAt: now,
      formatVersion: 2 as const,
      preset: args.preset,
      overrides: args.overrides,
      quickActions: args.quickActions,
      syncScope: args.syncScope,
      navLayoutMode: args.navLayoutMode,
    };

    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("navigationUserConfig", row);
  },
});

export const listAccountsForGlobalNavAdmin = query({
  args: { memberUserKey: v.string() },
  handler: async (ctx, { memberUserKey }) => {
    const actor = await tryGetAuthUserByPermissionKey(
      ctx,
      memberUserKey.trim(),
    );
    if (!authUserHasGlobalAdminElevation(actor)) {
      return [] as const;
    }
    const users = await ctx.db.query("authUsers").collect();
    users.sort((a, b) =>
      (a.displayUsername || a.normalizedUsername).localeCompare(
        b.displayUsername || b.normalizedUsername,
        undefined,
        { sensitivity: "base" },
      ),
    );
    return users.map((u) => ({
      accountId: u._id as string,
      displayUsername: u.displayUsername,
      email: u.email ?? "",
    }));
  },
});

export const upsertOrgNavigationPolicy = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    enforcedVisibleIds: v.array(v.string()),
    enforcedHiddenIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "org.roles.manage",
    );
    const now = Date.now();
    const rows = await ctx.db
      .query("organizationNavigationPolicy")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
    const existing =
      rows.length === 0
        ? null
        : rows.reduce((best, r) => (r.updatedAt > best.updatedAt ? r : best));

    const row = {
      organizationId: args.organizationId,
      updatedAt: now,
      formatVersion: 1 as const,
      enforcedVisibleIds: args.enforcedVisibleIds,
      enforcedHiddenIds: args.enforcedHiddenIds,
    };

    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("organizationNavigationPolicy", row);
  },
});

/**
 * Reads org nav policy for the signed-in shell. Uses `v.string()` + structural /
 * row checks so malformed session / storage ids surface as `null` instead of a
 * Convex argument validation error ("Server Error" on the client).
 */
export const getOrgNavigationPolicy = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    try {
      const trimmed = organizationId.trim();
      if (!trimmed) return null;
      const canon = parseConvexDocumentId(trimmed);
      if (!canon) return null;
      const id = canon as Id<"organizations">;
      const organization = await ctx.db.get(id);
      if (!organization) return null;

      const rows = await ctx.db
        .query("organizationNavigationPolicy")
        .withIndex("by_organization", (q) => q.eq("organizationId", id))
        .collect();
      if (rows.length === 0) return null;
      let best = rows[0]!;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]!;
        const bu = best.updatedAt ?? 0;
        const ru = r.updatedAt ?? 0;
        if (ru > bu) best = r;
      }
      return best;
    } catch (err) {
      console.error("[getOrgNavigationPolicy]", err);
      return null;
    }
  },
});
