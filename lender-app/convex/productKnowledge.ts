import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { normalizeOrganizationPlan } from "../lib/orgPlanFeatures";
import { sessionKeyIsGlobalAdmin } from "./organizationAccess";
import { resolveAuthenticatedMemberKey } from "./callerAuth";
import { isSuperAdmin } from "./authUtils";
import { assertDataMigrationAdmin } from "./migrationAdminAuth";
import {
  productKnowledgeArticleBodyV,
  productKnowledgeArticleStatusV,
  productKnowledgeDeveloperGlossaryV,
  productKnowledgeDraftStatusV,
  productKnowledgeDetectedChangeV,
  productKnowledgeVisibilityRuleV,
  productReleaseChangeTypeV,
  productReleasePostStatusV,
} from "./productKnowledge/validators";
import {
  STATIC_PRODUCT_KNOWLEDGE_ARTICLE_SEEDS,
  STATIC_PRODUCT_RELEASE_POST_SEEDS,
} from "../lib/product-knowledge/staticSeed";


type Visibility = Doc<"productKnowledgeArticles">["visibility"];

type ViewerContext = {
  plan: "basic" | "pro" | "enterprise";
  productRoleKey: string;
  tenantRole: string;
};

async function viewerContext(
  ctx: QueryCtx,
  organizationId: Id<"organizations"> | undefined,
  memberUserKey: string,
): Promise<ViewerContext> {
  let plan: "basic" | "pro" | "enterprise" = "basic";
  let productRoleKey = "";
  let tenantRole = "";

  if (organizationId) {
    const org = await ctx.db.get(organizationId);
    if (org) {
      plan = normalizeOrganizationPlan(org.plan);
    }
    if (await isSuperAdmin(ctx, memberUserKey)) {
      return { plan, productRoleKey: "admin", tenantRole: "owner" };
    }
    const key = memberUserKey.trim();
    const member = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organizationId).eq("userKey", key),
      )
      .first();
    if (member) {
      tenantRole = member.role ?? "";
      if (member.assignedRoleId) {
        const role = await ctx.db.get(member.assignedRoleId);
        if (role?.key) productRoleKey = role.key;
      }
    }
  }

  return { plan, productRoleKey, tenantRole };
}

function passesVisibility(
  visibility: Visibility | undefined,
  viewer: ViewerContext,
): boolean {
  if (!visibility) return true;
  const { orgPlans, orgRoles } = visibility;
  if (orgPlans?.length && !orgPlans.includes(viewer.plan)) return false;
  if (orgRoles?.length) {
    const roleKeys = [viewer.productRoleKey, viewer.tenantRole].filter(Boolean);
    if (!orgRoles.some((r) => roleKeys.includes(r))) return false;
  }
  return true;
}

async function assertGlobalAdmin(
  ctx: QueryCtx,
  memberUserKey: string,
): Promise<void> {
  if (!(await sessionKeyIsGlobalAdmin(ctx, memberUserKey))) {
    throw new Error("Global administrator required.");
  }
}

export const listPublishedArticlesForViewer = query({
  args: {
    memberUserKey: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const memberUserKey = await resolveAuthenticatedMemberKey(
      ctx,
      args.memberUserKey,
    );
    const viewer = await viewerContext(ctx, args.organizationId, memberUserKey);
    const rows = await ctx.db
      .query("productKnowledgeArticles")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    return rows
      .filter((row) => passesVisibility(row.visibility, viewer))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
});

export const listPublishedReleasePostsForViewer = query({
  args: {
    memberUserKey: v.string(),
    organizationId: v.optional(v.id("organizations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const memberUserKey = await resolveAuthenticatedMemberKey(
      ctx,
      args.memberUserKey,
    );
    const viewer = await viewerContext(ctx, args.organizationId, memberUserKey);
    const cap = Math.min(Math.max(args.limit ?? 40, 1), 100);
    const rows = await ctx.db
      .query("productReleasePosts")
      .withIndex("by_status_publishedAt", (q) => q.eq("status", "published"))
      .order("desc")
      .take(cap * 2);
    return rows
      .filter((row) => passesVisibility(row.visibility, viewer))
      .slice(0, cap);
  },
});

export const unreadReleaseCountForUser = query({
  args: {
    memberUserKey: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const memberUserKey = await resolveAuthenticatedMemberKey(
      ctx,
      args.memberUserKey,
    );
    const viewer = await viewerContext(ctx, args.organizationId, memberUserKey);
    const receipt = await ctx.db
      .query("productReleaseReadReceipts")
      .withIndex("by_userKey", (q) => q.eq("userKey", memberUserKey))
      .first();
    const watermark = receipt?.lastReadPublishedAt ?? 0;
    const posts = await ctx.db
      .query("productReleasePosts")
      .withIndex("by_status_publishedAt", (q) => q.eq("status", "published"))
      .order("desc")
      .take(100);
    return posts.filter(
      (p) =>
        (p.publishedAt ?? 0) > watermark &&
        passesVisibility(p.visibility, viewer),
    ).length;
  },
});

export const markReleaseFeedRead = mutation({
  args: {
    memberUserKey: v.string(),
    throughPublishedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const memberUserKey = await resolveAuthenticatedMemberKey(
      ctx,
      args.memberUserKey,
    );
    const through = args.throughPublishedAt;
    const existing = await ctx.db
      .query("productReleaseReadReceipts")
      .withIndex("by_userKey", (q) => q.eq("userKey", memberUserKey))
      .first();
    const now = Date.now();
    if (!existing) {
      await ctx.db.insert("productReleaseReadReceipts", {
        userKey: memberUserKey,
        lastReadPublishedAt: through,
        updatedAt: now,
      });
      return;
    }
    if (through > (existing.lastReadPublishedAt ?? 0)) {
      await ctx.db.patch(existing._id, {
        lastReadPublishedAt: through,
        updatedAt: now,
      });
    }
  },
});

export const adminStats = query({
  args: { memberUserKey: v.string() },
  handler: async (ctx, args) => {
    await assertGlobalAdmin(ctx, args.memberUserKey);
    const articles = await ctx.db.query("productKnowledgeArticles").collect();
    const posts = await ctx.db.query("productReleasePosts").collect();
    const drafts = await ctx.db.query("productKnowledgeDrafts").collect();
    return {
      articleCount: articles.length,
      publishedArticleCount: articles.filter((a) => a.status === "published")
        .length,
      postCount: posts.length,
      publishedPostCount: posts.filter((p) => p.status === "published").length,
      pendingDraftCount: drafts.filter((d) => d.status === "pending").length,
    };
  },
});

export const adminListReleasePosts = query({
  args: { memberUserKey: v.string() },
  handler: async (ctx, args) => {
    await assertGlobalAdmin(ctx, args.memberUserKey);
    const rows = await ctx.db.query("productReleasePosts").collect();
    return rows.sort(
      (a, b) => (b.updatedAt ?? b.publishedAt ?? 0) - (a.updatedAt ?? a.publishedAt ?? 0),
    );
  },
});

function slugifyReleaseTitle(title: string, now: number): string {
  const slugBase = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${slugBase || "update"}-${now}`;
}

/** Reject 0 / epoch / junk so posts are not buried at the bottom of the feed. */
function normalizeReleasePublishedAt(
  ms: number | undefined,
): number | undefined {
  if (ms == null || !Number.isFinite(ms)) return undefined;
  // Before 2020-01-01 UTC is treated as unset (covers publishedAt: 0).
  if (ms < 1_577_836_800_000) return undefined;
  return ms;
}

async function upsertPublishedReleasePost(
  ctx: { db: MutationCtx["db"] },
  args: {
    slug?: string;
    title: string;
    summary: string;
    body: string[];
    changeType: Doc<"productReleasePosts">["changeType"];
    affectedPersonas: string[];
    affectedArticleSlugs: string[];
    learnMoreSlug?: string;
    visibility?: Doc<"productReleasePosts">["visibility"];
    deploymentId?: string;
    publishedAt?: number;
  },
): Promise<Id<"productReleasePosts">> {
  const now = Date.now();
  const slug =
    args.slug?.trim() || slugifyReleaseTitle(args.title, now);
  const existing = await ctx.db
    .query("productReleasePosts")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  const requestedPublishedAt = normalizeReleasePublishedAt(args.publishedAt);
  const existingPublishedAt = normalizeReleasePublishedAt(
    existing?.publishedAt,
  );
  // Prefer a valid existing stamp; never persist 0 / epoch from seed files.
  const publishedAt =
    requestedPublishedAt ?? existingPublishedAt ?? now;
  const patch: {
    slug: string;
    title: string;
    summary: string;
    body: string[];
    changeType: Doc<"productReleasePosts">["changeType"];
    affectedPersonas: string[];
    affectedArticleSlugs: string[];
    status: "published";
    publishedAt: number;
    updatedAt: number;
    learnMoreSlug?: string;
    deploymentId?: string;
    visibility?: Doc<"productReleasePosts">["visibility"];
  } = {
    slug,
    title: args.title.trim().slice(0, 200),
    summary: args.summary.trim().slice(0, 500),
    body: args.body.map((p) => p.trim()).filter(Boolean).slice(0, 20),
    changeType: args.changeType,
    affectedPersonas: args.affectedPersonas.slice(0, 12),
    affectedArticleSlugs: args.affectedArticleSlugs.slice(0, 24),
    status: "published",
    publishedAt,
    updatedAt: now,
  };
  const learnMoreSlug = args.learnMoreSlug?.trim();
  if (learnMoreSlug) patch.learnMoreSlug = learnMoreSlug;
  const deploymentId =
    args.deploymentId?.trim() || existing?.deploymentId || undefined;
  if (deploymentId) patch.deploymentId = deploymentId;
  if (args.visibility) patch.visibility = args.visibility;
  if (existing) {
    await ctx.db.patch(existing._id, {
      ...patch,
      ...(args.deploymentId?.trim()
        ? { deploymentId: args.deploymentId.trim() }
        : {}),
    });
    return existing._id;
  }
  return await ctx.db.insert("productReleasePosts", patch);
}

export const adminPublishReleasePost = mutation({
  args: {
    memberUserKey: v.string(),
    title: v.string(),
    summary: v.string(),
    body: v.array(v.string()),
    changeType: productReleaseChangeTypeV,
    affectedPersonas: v.array(v.string()),
    affectedArticleSlugs: v.array(v.string()),
    learnMoreSlug: v.optional(v.string()),
    visibility: v.optional(productKnowledgeVisibilityRuleV),
    slug: v.optional(v.string()),
    deploymentId: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertGlobalAdmin(ctx, args.memberUserKey);
    return await upsertPublishedReleasePost(ctx, {
      slug: args.slug,
      title: args.title,
      summary: args.summary,
      body: args.body,
      changeType: args.changeType,
      affectedPersonas: args.affectedPersonas,
      affectedArticleSlugs: args.affectedArticleSlugs,
      learnMoreSlug: args.learnMoreSlug,
      visibility: args.visibility,
      deploymentId: args.deploymentId,
      publishedAt: args.publishedAt,
    });
  },
});

/**
 * Operator/CLI publish — gated by DATA_MIGRATION_ADMIN_SECRET.
 * Prefer a stable `slug` so re-runs are idempotent (agents can append ship notes safely).
 */
export const operatorPublishReleasePost = mutation({
  args: {
    operatorSecret: v.string(),
    title: v.string(),
    summary: v.string(),
    body: v.array(v.string()),
    changeType: productReleaseChangeTypeV,
    affectedPersonas: v.optional(v.array(v.string())),
    affectedArticleSlugs: v.optional(v.array(v.string())),
    learnMoreSlug: v.optional(v.string()),
    visibility: v.optional(productKnowledgeVisibilityRuleV),
    slug: v.optional(v.string()),
    deploymentId: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.operatorSecret);
    return await upsertPublishedReleasePost(ctx, {
      slug: args.slug,
      title: args.title,
      summary: args.summary,
      body: args.body,
      changeType: args.changeType,
      affectedPersonas: args.affectedPersonas ?? ["All users"],
      affectedArticleSlugs: args.affectedArticleSlugs ?? [],
      learnMoreSlug: args.learnMoreSlug,
      visibility: args.visibility,
      deploymentId: args.deploymentId,
      publishedAt: args.publishedAt,
    });
  },
});


export const adminSeedPlatformContentIfEmpty = mutation({
  args: { memberUserKey: v.string() },
  handler: async (ctx, args) => {
    await assertGlobalAdmin(ctx, args.memberUserKey);
    const existingArticle = await ctx.db
      .query("productKnowledgeArticles")
      .first();
    const existingPost = await ctx.db.query("productReleasePosts").first();
    if (existingArticle || existingPost) {
      return {
        seeded: false,
        reason: "Content already exists.",
        articlesInserted: 0,
        postsInserted: 0,
      };
    }

    const now = Date.now();
    let articlesInserted = 0;
    for (const seed of STATIC_PRODUCT_KNOWLEDGE_ARTICLE_SEEDS) {
      await ctx.db.insert("productKnowledgeArticles", {
        slug: seed.slug,
        legacyId: seed.legacyId,
        title: seed.title,
        summary: seed.summary,
        categoryId: seed.categoryId,
        keywords: seed.keywords,
        body: seed.body,
        developerGlossary: seed.developerGlossary,
        status: "published",
        publishedAt: now,
        updatedAt: now,
        sourceRevision: "static-seed-v1",
      });
      articlesInserted++;
    }

    let postsInserted = 0;
    for (const seed of STATIC_PRODUCT_RELEASE_POST_SEEDS) {
      await ctx.db.insert("productReleasePosts", {
        slug: seed.slug,
        title: seed.title,
        summary: seed.summary,
        body: seed.body,
        changeType: seed.changeType,
        affectedPersonas: seed.affectedPersonas,
        affectedArticleSlugs: seed.affectedArticleSlugs,
        learnMoreSlug: seed.learnMoreSlug,
        status: "published",
        publishedAt: now + postsInserted,
        updatedAt: now,
      });
      postsInserted++;
    }

    return { seeded: true, articlesInserted, postsInserted };
  },
});

export const adminInsertDraft = mutation({
  args: {
    memberUserKey: v.string(),
    detectedChanges: v.array(productKnowledgeDetectedChangeV),
    confidence: v.optional(v.number()),
    proposedArticleSlug: v.optional(v.string()),
    proposedPostTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertGlobalAdmin(ctx, args.memberUserKey);
    const now = Date.now();
    return await ctx.db.insert("productKnowledgeDrafts", {
      detectedChanges: args.detectedChanges,
      confidence: args.confidence,
      proposedArticleSlug: args.proposedArticleSlug,
      proposedPostTitle: args.proposedPostTitle,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const adminListPendingDrafts = query({
  args: { memberUserKey: v.string() },
  handler: async (ctx, args) => {
    await assertGlobalAdmin(ctx, args.memberUserKey);
    const rows = await ctx.db
      .query("productKnowledgeDrafts")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const adminUpsertArticle = mutation({
  args: {
    memberUserKey: v.string(),
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    categoryId: v.string(),
    body: productKnowledgeArticleBodyV,
    keywords: v.optional(v.array(v.string())),
    developerGlossary: v.optional(productKnowledgeDeveloperGlossaryV),
    status: productKnowledgeArticleStatusV,
    visibility: v.optional(productKnowledgeVisibilityRuleV),
  },
  handler: async (ctx, args) => {
    await assertGlobalAdmin(ctx, args.memberUserKey);
    const slug = args.slug.trim();
    const existing = await ctx.db
      .query("productKnowledgeArticles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    const now = Date.now();
    const patch = {
      slug,
      legacyId: slug,
      title: args.title.trim(),
      summary: args.summary.trim(),
      categoryId: args.categoryId,
      body: args.body,
      keywords: args.keywords ?? [],
      developerGlossary: args.developerGlossary,
      status: args.status,
      visibility: args.visibility,
      updatedAt: now,
      ...(args.status === "published"
        ? { publishedAt: existing?.publishedAt ?? now }
        : {}),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("productKnowledgeArticles", {
      ...patch,
      publishedAt: args.status === "published" ? now : undefined,
    });
  },
});
