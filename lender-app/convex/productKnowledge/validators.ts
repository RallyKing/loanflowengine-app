import { v } from "convex/values";

export const productKnowledgeVisibilityRuleV = v.object({
  orgPlans: v.optional(
    v.array(
      v.union(
        v.literal("basic"),
        v.literal("pro"),
        v.literal("enterprise"),
      ),
    ),
  ),
  orgRoles: v.optional(v.array(v.string())),
  featureFlags: v.optional(v.array(v.string())),
  minRole: v.optional(v.string()),
});

export const productKnowledgeArticleStatusV = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

export const productReleasePostStatusV = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

export const productReleaseChangeTypeV = v.union(
  v.literal("added"),
  v.literal("changed"),
  v.literal("moved"),
  v.literal("fixed"),
  v.literal("improved"),
  v.literal("redesigned"),
);

export const productKnowledgeDeveloperGlossaryV = v.object({
  routes: v.optional(v.array(v.string())),
  blockIds: v.optional(v.array(v.string())),
  navIds: v.optional(v.array(v.string())),
  convexQueries: v.optional(v.array(v.string())),
  componentPaths: v.optional(v.array(v.string())),
  notes: v.optional(v.array(v.string())),
});

export const productKnowledgeArticleBodyV = v.object({
  purpose: v.string(),
  whatYouCanDo: v.array(v.string()),
  storedHere: v.array(v.string()),
  storedElsewhere: v.array(v.string()),
  relatedSlugs: v.array(v.string()),
  paragraphs: v.optional(v.array(v.string())),
});

export const productKnowledgeDraftStatusV = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

export const productKnowledgeDetectedChangeV = v.object({
  kind: v.union(
    v.literal("route"),
    v.literal("nav"),
    v.literal("block"),
    v.literal("permission"),
    v.literal("schema"),
    v.literal("other"),
  ),
  id: v.string(),
  description: v.string(),
});
