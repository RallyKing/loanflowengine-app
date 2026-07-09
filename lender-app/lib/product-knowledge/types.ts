/**
 * Product Knowledge System — shared types (Phase 0C foundation).
 * Convex schema and UI consume these shapes in later phases.
 */

/** Encyclopedia category IDs — aligned to census / nav / pipeline blocks. */
export type ProductKnowledgeCategoryId =
  | "basics"
  | "tasks"
  | "pipeline-hub"
  | "pipeline-file"
  | "contacts"
  | "lenders"
  | "documents"
  | "activity"
  | "events"
  | "sharing"
  | "portal"
  | "analytics"
  | "ledger"
  | "operations"
  | "settings"
  | "account";

export type ProductKnowledgeCategory = {
  id: ProductKnowledgeCategoryId;
  label: string;
  /** Optional sort order in help sidebar */
  order: number;
};

export const PRODUCT_KNOWLEDGE_CATEGORIES: readonly ProductKnowledgeCategory[] =
  [
    { id: "basics", label: "Basics", order: 10 },
    { id: "tasks", label: "Tasks", order: 20 },
    { id: "pipeline-hub", label: "Pipeline hub", order: 30 },
    { id: "pipeline-file", label: "Pipeline file workspace", order: 40 },
    { id: "contacts", label: "Contacts", order: 50 },
    { id: "lenders", label: "Lenders", order: 60 },
    { id: "documents", label: "Documents", order: 70 },
    { id: "activity", label: "Activity", order: 80 },
    { id: "events", label: "Events", order: 90 },
    { id: "sharing", label: "Sharing", order: 100 },
    { id: "portal", label: "Client portal", order: 110 },
    { id: "analytics", label: "Analytics", order: 120 },
    { id: "ledger", label: "Ledger", order: 130 },
    { id: "operations", label: "Operations", order: 140 },
    { id: "settings", label: "Settings", order: 150 },
    { id: "account", label: "Account & team", order: 160 },
  ] as const;

export type ProductKnowledgeArticleStatus = "draft" | "published" | "archived";

/** Structured encyclopedia body (user-facing fields). */
export type ProductKnowledgeArticleBody = {
  purpose: string;
  whatYouCanDo: string[];
  storedHere: string[];
  storedElsewhere: string[];
  relatedSlugs: string[];
  /** Optional extra paragraphs (plain language). */
  paragraphs?: string[];
};

/** Founder / global-admin only — never shown in standard help UI. */
export type ProductKnowledgeDeveloperGlossary = {
  routes?: string[];
  blockIds?: string[];
  navIds?: string[];
  convexQueries?: string[];
  componentPaths?: string[];
  notes?: string[];
};

/** Software-owner visibility filtering (Phase 2). */
export type ProductKnowledgeVisibilityRule = {
  orgPlans?: string[];
  orgRoles?: string[];
  featureFlags?: string[];
  minRole?: string;
};

export type ProductKnowledgeArticle = {
  slug: string;
  title: string;
  summary: string;
  categoryId: ProductKnowledgeCategoryId;
  body: ProductKnowledgeArticleBody;
  developerGlossary?: ProductKnowledgeDeveloperGlossary;
  status: ProductKnowledgeArticleStatus;
  publishedAt?: number;
  updatedAt?: number;
  sourceRevision?: string;
  visibility?: ProductKnowledgeVisibilityRule;
  keywords?: string[];
};

export type ProductReleaseChangeType =
  | "added"
  | "changed"
  | "moved"
  | "fixed"
  | "improved"
  | "redesigned";

export type ProductReleasePostStatus = "draft" | "published" | "archived";

/** Human-facing changelog entry — no developer jargon in published fields. */
export type ProductReleasePost = {
  slug: string;
  title: string;
  summary: string;
  /** Plain-language paragraphs for the feed. */
  body: string[];
  changeType: ProductReleaseChangeType;
  affectedPersonas: string[];
  affectedArticleSlugs: string[];
  learnMoreSlug?: string;
  status: ProductReleasePostStatus;
  publishedAt?: number;
  visibility?: ProductKnowledgeVisibilityRule;
};

export type ProductKnowledgeDraftStatus =
  | "pending"
  | "approved"
  | "rejected";

export type ProductKnowledgeDetectedChange = {
  kind: "route" | "nav" | "block" | "permission" | "schema" | "other";
  id: string;
  description: string;
};

export type ProductKnowledgeDraft = {
  proposedArticle?: Partial<ProductKnowledgeArticle>;
  proposedReleasePost?: Partial<ProductReleasePost>;
  detectedChanges: ProductKnowledgeDetectedChange[];
  confidence?: number;
  status: ProductKnowledgeDraftStatus;
  createdAt: number;
};
