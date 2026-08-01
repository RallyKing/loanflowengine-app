import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrgPermission } from "./organizationRbac";
import { assertOrganizationId } from "./organizationValidators";
import {
  isSuperAdmin,
  requireOrgReaderKey,
  requireOrgSettingsAdminKey,
} from "./authUtils";
import {
  appendStageArchitectureActivity,
  listOrgStageBundle,
  seedDefaultOrgPipelineStages,
  uniqueStageSlug,
} from "./organizationPipelineStagesHelpers";

const orgArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

async function requireMemberKey(
  ctx: Parameters<typeof requireOrgReaderKey>[0],
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  return requireOrgReaderKey(
    ctx,
    organizationId,
    memberUserKey,
    "organizationPipelineStages.requireMemberKey",
  );
}

async function requireStageArchitect(
  ctx: Parameters<typeof requireOrgSettingsAdminKey>[0],
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  if (await isSuperAdmin(ctx, memberUserKey)) {
    return requireMemberKey(ctx, organizationId, memberUserKey);
  }
  return requireOrgSettingsAdminKey(
    ctx,
    organizationId,
    memberUserKey,
    "organizationPipelineStages.requireStageArchitect",
  );
}

/** List org stages + sub-stages (read-only). Does not seed — call `ensureSeeded` once. */
export const listForOrganization = query({
  args: orgArgs,
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrganizationId(ctx, organizationId);
    await requireMemberKey(ctx, organizationId, memberUserKey);
    return await listOrgStageBundle(ctx, organizationId);
  },
});

/** Idempotent bootstrap — seeds legacy funnel stages once per org. */
export const ensureSeeded = mutation({
  args: orgArgs,
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrganizationId(ctx, organizationId);
    const key = await requireMemberKey(ctx, organizationId, memberUserKey);
    const result = await seedDefaultOrgPipelineStages(ctx, organizationId, key);
    if (result.seeded) {
      await appendStageArchitectureActivity(ctx, {
        organizationId,
        kind: "stage_created",
        summary: `Seeded ${result.stageCount} default pipeline stages`,
        actorUserKey: key,
      });
    }
    return result;
  },
});

export const createStage = mutation({
  args: {
    ...orgArgs,
    name: v.string(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertOrganizationId(ctx, args.organizationId);
    const key = await requireStageArchitect(ctx, args.organizationId, args.memberUserKey);
    const name = args.name.trim();
    if (!name) throw new Error("Stage name required");

    const existing = await ctx.db
      .query("organizationPipelineStages")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
    const slugs = new Set(existing.map((r) => r.slug));
    const slug = uniqueStageSlug(name, slugs);
    const maxOrder = existing.reduce((m, r) => Math.max(m, r.order), 0);
    const now = Date.now();

    if (args.isDefault) {
      for (const row of existing) {
        if (row.isDefault) {
          await ctx.db.patch(row._id, { isDefault: false, updatedAt: now, updatedBy: key });
        }
      }
    }

    const id = await ctx.db.insert("organizationPipelineStages", {
      organizationId: args.organizationId,
      name,
      slug,
      color: args.color?.trim() || "#F59E0B",
      icon: args.icon?.trim() || "circle",
      order: maxOrder + 10,
      isDefault: args.isDefault === true,
      isArchived: false,
      createdBy: key,
      updatedBy: key,
      createdAt: now,
      updatedAt: now,
    });

    await appendStageArchitectureActivity(ctx, {
      organizationId: args.organizationId,
      kind: "stage_created",
      summary: `Pipeline stage created: ${name}`,
      actorUserKey: key,
    });
    return { id };
  },
});

export const updateStage = mutation({
  args: {
    ...orgArgs,
    stageId: v.id("organizationPipelineStages"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertOrganizationId(ctx, args.organizationId);
    const key = await requireStageArchitect(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.stageId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Stage not found");
    }
    const now = Date.now();
    const patch: Partial<Doc<"organizationPipelineStages">> = {
      updatedAt: now,
      updatedBy: key,
    };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Stage name required");
      patch.name = name;
    }
    if (args.color !== undefined) patch.color = args.color.trim() || row.color;
    if (args.icon !== undefined) patch.icon = args.icon.trim() || row.icon;
    if (args.isArchived !== undefined) patch.isArchived = args.isArchived;
    if (args.isDefault === true) {
      patch.isDefault = true;
      const siblings = await ctx.db
        .query("organizationPipelineStages")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .collect();
      for (const s of siblings) {
        if (s._id !== row._id && s.isDefault) {
          await ctx.db.patch(s._id, { isDefault: false, updatedAt: now, updatedBy: key });
        }
      }
    } else if (args.isDefault === false) {
      patch.isDefault = false;
    }
    await ctx.db.patch(row._id, patch);
    await appendStageArchitectureActivity(ctx, {
      organizationId: args.organizationId,
      kind: "stage_updated",
      summary: `Pipeline stage updated: ${patch.name ?? row.name}`,
      actorUserKey: key,
    });
    return { ok: true as const };
  },
});

export const deleteStage = mutation({
  args: {
    ...orgArgs,
    stageId: v.id("organizationPipelineStages"),
  },
  handler: async (ctx, args) => {
    await assertOrganizationId(ctx, args.organizationId);
    const key = await requireStageArchitect(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.stageId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Stage not found");
    }
    const subs = await ctx.db
      .query("organizationPipelineSubStages")
      .withIndex("by_parent", (q) => q.eq("parentStageId", row._id))
      .collect();
    for (const sub of subs) {
      await ctx.db.delete(sub._id);
    }
    await ctx.db.delete(row._id);
    await appendStageArchitectureActivity(ctx, {
      organizationId: args.organizationId,
      kind: "stage_deleted",
      summary: `Pipeline stage deleted: ${row.name}`,
      actorUserKey: key,
    });
    return { ok: true as const };
  },
});

export const reorderStages = mutation({
  args: {
    ...orgArgs,
    orderedStageIds: v.array(v.id("organizationPipelineStages")),
  },
  handler: async (ctx, args) => {
    await assertOrganizationId(ctx, args.organizationId);
    const key = await requireStageArchitect(ctx, args.organizationId, args.memberUserKey);
    const now = Date.now();
    let order = 10;
    for (const id of args.orderedStageIds) {
      const row = await ctx.db.get(id);
      if (!row || row.organizationId !== args.organizationId) continue;
      await ctx.db.patch(id, { order, updatedAt: now, updatedBy: key });
      order += 10;
    }
    await appendStageArchitectureActivity(ctx, {
      organizationId: args.organizationId,
      kind: "stage_updated",
      summary: "Pipeline stages reordered",
      actorUserKey: key,
    });
    return { ok: true as const };
  },
});

export const createSubStage = mutation({
  args: {
    ...orgArgs,
    parentStageId: v.id("organizationPipelineStages"),
    name: v.string(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertOrganizationId(ctx, args.organizationId);
    const key = await requireStageArchitect(ctx, args.organizationId, args.memberUserKey);
    const parent = await ctx.db.get(args.parentStageId);
    if (!parent || parent.organizationId !== args.organizationId) {
      throw new Error("Parent stage not found");
    }
    const name = args.name.trim();
    if (!name) throw new Error("Sub-stage name required");
    const siblings = await ctx.db
      .query("organizationPipelineSubStages")
      .withIndex("by_parent", (q) => q.eq("parentStageId", parent._id))
      .collect();
    const slugs = new Set(siblings.map((r) => r.slug));
    const slug = uniqueStageSlug(name, slugs);
    const maxOrder = siblings.reduce((m, r) => Math.max(m, r.order), 0);
    const now = Date.now();
    const id = await ctx.db.insert("organizationPipelineSubStages", {
      organizationId: args.organizationId,
      parentStageId: parent._id,
      name,
      slug,
      order: maxOrder + 10,
      color: args.color?.trim() || parent.color,
      isArchived: false,
      createdBy: key,
      updatedBy: key,
      createdAt: now,
      updatedAt: now,
    });
    await appendStageArchitectureActivity(ctx, {
      organizationId: args.organizationId,
      kind: "substage_created",
      summary: `Sub-stage created: ${parent.name} › ${name}`,
      actorUserKey: key,
    });
    return { id };
  },
});

export const updateSubStage = mutation({
  args: {
    ...orgArgs,
    subStageId: v.id("organizationPipelineSubStages"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    isArchived: v.optional(v.boolean()),
    parentStageId: v.optional(v.id("organizationPipelineStages")),
  },
  handler: async (ctx, args) => {
    await assertOrganizationId(ctx, args.organizationId);
    const key = await requireStageArchitect(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.subStageId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Sub-stage not found");
    }
    const now = Date.now();
    const patch: Partial<Doc<"organizationPipelineSubStages">> = {
      updatedAt: now,
      updatedBy: key,
    };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Sub-stage name required");
      patch.name = name;
    }
    if (args.color !== undefined) patch.color = args.color.trim() || row.color;
    if (args.isArchived !== undefined) patch.isArchived = args.isArchived;
    if (args.parentStageId !== undefined) {
      const parent = await ctx.db.get(args.parentStageId);
      if (!parent || parent.organizationId !== args.organizationId) {
        throw new Error("Parent stage not found");
      }
      patch.parentStageId = args.parentStageId;
    }
    await ctx.db.patch(row._id, patch);
    await appendStageArchitectureActivity(ctx, {
      organizationId: args.organizationId,
      kind: "substage_updated",
      summary: `Sub-stage updated: ${patch.name ?? row.name}`,
      actorUserKey: key,
    });
    return { ok: true as const };
  },
});

export const deleteSubStage = mutation({
  args: {
    ...orgArgs,
    subStageId: v.id("organizationPipelineSubStages"),
  },
  handler: async (ctx, args) => {
    await assertOrganizationId(ctx, args.organizationId);
    const key = await requireStageArchitect(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.subStageId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Sub-stage not found");
    }
    await ctx.db.delete(row._id);
    await appendStageArchitectureActivity(ctx, {
      organizationId: args.organizationId,
      kind: "substage_deleted",
      summary: `Sub-stage deleted: ${row.name}`,
      actorUserKey: key,
    });
    return { ok: true as const };
  },
});

export const reorderSubStages = mutation({
  args: {
    ...orgArgs,
    parentStageId: v.id("organizationPipelineStages"),
    orderedSubStageIds: v.array(v.id("organizationPipelineSubStages")),
  },
  handler: async (ctx, args) => {
    await assertOrganizationId(ctx, args.organizationId);
    const key = await requireStageArchitect(ctx, args.organizationId, args.memberUserKey);
    const parent = await ctx.db.get(args.parentStageId);
    if (!parent || parent.organizationId !== args.organizationId) {
      throw new Error("Parent stage not found");
    }
    const now = Date.now();
    let order = 10;
    for (const id of args.orderedSubStageIds) {
      const row = await ctx.db.get(id);
      if (!row || row.parentStageId !== parent._id) continue;
      await ctx.db.patch(id, { order, updatedAt: now, updatedBy: key });
      order += 10;
    }
    await appendStageArchitectureActivity(ctx, {
      organizationId: args.organizationId,
      kind: "substage_updated",
      summary: `Sub-stages reordered under ${parent.name}`,
      actorUserKey: key,
    });
    return { ok: true as const };
  },
});
