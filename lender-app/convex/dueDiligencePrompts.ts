/**
 * Org-scoped AI Due Diligence prompt library (create / save / deploy).
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { assertOrgPermission, resolveMemberUserKey } from "./organizationAccess";
import {
  DUE_DILIGENCE_PROMPT_SEEDS,
  slugifyDueDiligencePromptTitle,
  validateDueDiligencePromptUpsert,
  type DueDiligenceTemplateKey,
} from "../lib/ai/dueDiligencePrompts";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const templateKeyV = v.union(
  v.literal("fraud_irregularities"),
  v.literal("loi_review"),
  v.literal("deal_analysis"),
  v.literal("custom"),
);

const promptPublicV = v.object({
  _id: v.id("dueDiligencePrompts"),
  title: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  templateKey: templateKeyV,
  body: v.string(),
  deployed: v.boolean(),
  archivedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function assertSettings(
  ctx: Parameters<typeof assertOrgPermission>[0],
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
) {
  await assertOrgPermission(
    ctx,
    organizationId,
    memberUserKey,
    "settings.access",
  );
  return resolveMemberUserKey(ctx, memberUserKey);
}

export const listPrompts = query({
  args: {
    organizationId: v.id("organizations"),
    includeArchived: v.optional(v.boolean()),
    ...memberKeyArg,
  },
  returns: v.array(promptPublicV),
  handler: async (ctx, args) => {
    try {
      await assertSettings(ctx, args.organizationId, args.memberUserKey);
    } catch {
      return [];
    }
    const rows = await ctx.db
      .query("dueDiligencePrompts")
      .withIndex("by_organization_updated", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .take(80);
    return rows
      .filter((r) => args.includeArchived || !r.archivedAt)
      .map((r) => ({
        _id: r._id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        templateKey: r.templateKey,
        body: r.body,
        deployed: r.deployed,
        archivedAt: r.archivedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
  },
});

/** Vault picker — deployed, non-archived prompts only. */
export const listDeployedPrompts = query({
  args: {
    organizationId: v.id("organizations"),
    ...memberKeyArg,
  },
  returns: v.array(promptPublicV),
  handler: async (ctx, args) => {
    try {
      await assertOrgPermission(
        ctx,
        args.organizationId,
        args.memberUserKey,
        "files.view",
      );
    } catch {
      return [];
    }
    const rows = await ctx.db
      .query("dueDiligencePrompts")
      .withIndex("by_organization_deployed", (q) =>
        q.eq("organizationId", args.organizationId).eq("deployed", true),
      )
      .collect();
    return rows
      .filter((r) => !r.archivedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((r) => ({
        _id: r._id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        templateKey: r.templateKey,
        body: r.body,
        deployed: r.deployed,
        archivedAt: r.archivedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
  },
});

export const upsertPrompt = mutation({
  args: {
    organizationId: v.id("organizations"),
    promptId: v.optional(v.id("dueDiligencePrompts")),
    title: v.string(),
    body: v.string(),
    description: v.optional(v.string()),
    templateKey: v.optional(templateKeyV),
    slug: v.optional(v.string()),
    deployed: v.optional(v.boolean()),
    ...memberKeyArg,
  },
  returns: v.object({ promptId: v.id("dueDiligencePrompts") }),
  handler: async (ctx, args) => {
    const actor = await assertSettings(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const errors = validateDueDiligencePromptUpsert({
      title: args.title,
      body: args.body,
      description: args.description,
      templateKey: args.templateKey as DueDiligenceTemplateKey | undefined,
      slug: args.slug,
      deployed: args.deployed,
    });
    if (errors.length > 0) throw new Error(errors[0]!.message);

    const title = args.title.trim();
    const body = args.body.trim();
    const description = args.description?.trim() || undefined;
    const templateKey = (args.templateKey ?? "custom") as DueDiligenceTemplateKey;
    const slug =
      (args.slug?.trim() || slugifyDueDiligencePromptTitle(title)).slice(0, 80);
    const deployed = args.deployed ?? true;
    const now = Date.now();

    if (args.promptId) {
      const existing = await ctx.db.get(args.promptId);
      if (!existing || existing.organizationId !== args.organizationId) {
        throw new Error("Prompt not found.");
      }
      await ctx.db.patch(args.promptId, {
        title,
        slug,
        description,
        templateKey,
        body,
        deployed,
        archivedAt: undefined,
        updatedByUserKey: actor,
        updatedAt: now,
      });
      return { promptId: args.promptId };
    }

    const promptId = await ctx.db.insert("dueDiligencePrompts", {
      organizationId: args.organizationId,
      title,
      slug,
      description,
      templateKey,
      body,
      deployed,
      createdByUserKey: actor,
      updatedByUserKey: actor,
      createdAt: now,
      updatedAt: now,
    });
    return { promptId };
  },
});

export const setPromptDeployed = mutation({
  args: {
    organizationId: v.id("organizations"),
    promptId: v.id("dueDiligencePrompts"),
    deployed: v.boolean(),
    ...memberKeyArg,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await assertSettings(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.promptId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Prompt not found.");
    }
    await ctx.db.patch(args.promptId, {
      deployed: args.deployed,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const archivePrompt = mutation({
  args: {
    organizationId: v.id("organizations"),
    promptId: v.id("dueDiligencePrompts"),
    ...memberKeyArg,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await assertSettings(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.promptId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Prompt not found.");
    }
    await ctx.db.patch(args.promptId, {
      archivedAt: Date.now(),
      deployed: false,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/** Seed the three built-in templates if the org has none yet. */
export const seedBuiltinPrompts = mutation({
  args: {
    organizationId: v.id("organizations"),
    ...memberKeyArg,
  },
  returns: v.object({ seeded: v.number() }),
  handler: async (ctx, args) => {
    const actor = await assertSettings(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const existing = await ctx.db
      .query("dueDiligencePrompts")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(1);
    if (existing.length > 0) return { seeded: 0 };

    const now = Date.now();
    let seeded = 0;
    for (const seed of DUE_DILIGENCE_PROMPT_SEEDS) {
      await ctx.db.insert("dueDiligencePrompts", {
        organizationId: args.organizationId,
        title: seed.title,
        slug: slugifyDueDiligencePromptTitle(seed.title),
        description: seed.description,
        templateKey: seed.templateKey,
        body: seed.body,
        deployed: true,
        createdByUserKey: actor,
        updatedByUserKey: actor,
        createdAt: now,
        updatedAt: now,
      });
      seeded += 1;
    }
    return { seeded };
  },
});
