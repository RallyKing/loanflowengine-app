import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { assertOrgPermission, assertOrgScopeArgs } from "./organizationAccess";

const presetArgs = {
  name: v.string(),
  search: v.optional(v.string()),
  entityType: v.optional(v.string()),
  section: v.optional(v.string()),
  matchDealAmount: v.optional(v.number()),
  programKeywords: v.optional(v.string()),
  stateCode: v.optional(v.string()),
  minRating: v.optional(v.number()),
  ficoCleared: v.optional(v.number()),
  propertyTypeContains: v.optional(v.string()),
  ownerOrInvestor: v.optional(v.string()),
  lenderMaxAtLeast: v.optional(v.number()),
  lenderMinAtMost: v.optional(v.number()),
};

const presetArgsPartial = { ...presetArgs, name: v.optional(v.string()) };

const orgScopeArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

export const listPresets = query({
  args: orgScopeArgs,
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    await assertOrgPermission(ctx, organizationId, memberUserKey, "files.view");
    const rows = await ctx.db
      .query("savedFilterPresets")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    return rows.sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "en"),
    );
  },
});

export const createPreset = mutation({
  args: { ...presetArgs, ...orgScopeArgs },
  handler: async (ctx, args) => {
    if (!args.name?.trim()) throw new Error("Name is required");
    await assertOrgScopeArgs(ctx, args.organizationId, args.memberUserKey);
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "files.view",
    );
    const now = Date.now();
    const name = args.name.trim();
    const id = await ctx.db.insert("savedFilterPresets", {
      name,
      search: args.search?.trim() || undefined,
      entityType: args.entityType || undefined,
      section: args.section || undefined,
      matchDealAmount: args.matchDealAmount,
      programKeywords: args.programKeywords?.trim() || undefined,
      stateCode: args.stateCode?.trim() || undefined,
      minRating: args.minRating,
      ficoCleared: args.ficoCleared,
      propertyTypeContains: args.propertyTypeContains?.trim() || undefined,
      ownerOrInvestor: args.ownerOrInvestor?.trim() || undefined,
      lenderMaxAtLeast: args.lenderMaxAtLeast,
      lenderMinAtMost: args.lenderMinAtMost,
      organizationId: args.organizationId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const updatePreset = mutation({
  args: { id: v.id("savedFilterPresets"), ...presetArgsPartial, ...orgScopeArgs },
  handler: async (ctx, { id, name, organizationId, memberUserKey, ...rest }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    await assertOrgPermission(ctx, organizationId, memberUserKey, "files.view");
    const r = await ctx.db.get(id);
    if (!r) throw new Error("Preset not found");
    if (r.organizationId !== organizationId) {
      throw new Error("Preset not found");
    }
    if (name !== undefined && !name?.trim()) {
      throw new Error("Name is required");
    }
    await ctx.db.patch(id, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      search: rest.search?.trim() || undefined,
      entityType: rest.entityType || undefined,
      section: rest.section || undefined,
      matchDealAmount: rest.matchDealAmount,
      programKeywords: rest.programKeywords?.trim() || undefined,
      stateCode: rest.stateCode?.trim() || undefined,
      minRating: rest.minRating,
      ficoCleared: rest.ficoCleared,
      propertyTypeContains: rest.propertyTypeContains?.trim() || undefined,
      ownerOrInvestor: rest.ownerOrInvestor?.trim() || undefined,
      lenderMaxAtLeast: rest.lenderMaxAtLeast,
      lenderMinAtMost: rest.lenderMinAtMost,
      updatedAt: Date.now(),
    });
  },
});

export const deletePreset = mutation({
  args: { id: v.id("savedFilterPresets"), ...orgScopeArgs },
  handler: async (ctx, { id, organizationId, memberUserKey }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    await assertOrgPermission(ctx, organizationId, memberUserKey, "files.view");
    const r = await ctx.db.get(id);
    if (!r || r.organizationId !== organizationId) {
      throw new Error("Preset not found");
    }
    await ctx.db.delete(id);
  },
});

export type PresetId = Id<"savedFilterPresets">;
