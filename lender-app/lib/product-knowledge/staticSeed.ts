/**
 * Platform-global seed payloads for Convex product knowledge (Phase 2).
 * Sourced from helpCenterContent — keep in sync when static articles change.
 */

import { HELP_ARTICLES } from "../helpCenterContent";
import type { HelpArticle } from "../helpCenterContent";

export type StaticArticleSeed = {
  slug: string;
  legacyId: string;
  title: string;
  summary: string;
  categoryId: string;
  keywords: string[];
  body: {
    purpose: string;
    whatYouCanDo: string[];
    storedHere: string[];
    storedElsewhere: string[];
    relatedSlugs: string[];
    paragraphs: string[];
  };
  developerGlossary?: HelpArticle["developerGlossary"];
};

function toSeed(article: HelpArticle): StaticArticleSeed {
  return {
    slug: article.id,
    legacyId: article.id,
    title: article.title,
    summary: article.summary,
    categoryId: article.category,
    keywords: article.keywords ?? [],
    body: {
      purpose: article.purpose ?? article.summary,
      whatYouCanDo: article.whatYouCanDo ?? [],
      storedHere: article.storedHere ?? [],
      storedElsewhere: article.storedElsewhere ?? [],
      relatedSlugs: (article.relatedArticleIds ?? []).map(String),
      paragraphs: article.body,
    },
    developerGlossary: article.developerGlossary,
  };
}

export const STATIC_PRODUCT_KNOWLEDGE_ARTICLE_SEEDS: StaticArticleSeed[] =
  HELP_ARTICLES.map(toSeed);

export const STATIC_PRODUCT_RELEASE_POST_SEEDS = [
  {
    slug: "welcome-product-knowledge",
    title: "In-app help encyclopedia is live",
    summary:
      "Browse how Loan Flow Engine works from the Help button or press ? anywhere outside a text field.",
    body: [
      "We added a searchable feature encyclopedia with articles for Pipeline, Tasks, Contacts, and more.",
      "Open Help from the header or Settings → Help & support. Contextual tips still appear on key routes.",
    ],
    changeType: "added" as const,
    affectedPersonas: ["All users"],
    affectedArticleSlugs: ["workspace-overview"],
    learnMoreSlug: "workspace-overview",
  },
  {
    slug: "product-updates-feed",
    title: "Product updates feed",
    summary:
      "A separate Updates bell in the header shows human-friendly release notes — not task or mention alerts.",
    body: [
      "Look for the sparkles icon next to Alerts. This feed is for product changes only.",
      "Operational notifications stay in the Alerts bell.",
    ],
    changeType: "added" as const,
    affectedPersonas: ["All users"],
    affectedArticleSlugs: ["notifications"],
    learnMoreSlug: "notifications",
  },
  {
    slug: "pipeline-hub-guide",
    title: "New guides: Pipeline hub & file workspace",
    summary:
      "Help articles now cover projection modes, filters, and the full file workspace.",
    body: [
      "Find Pipeline hub — list, filters, and projections and Pipeline file workspace under Pipeline & deals in Help.",
    ],
    changeType: "improved" as const,
    affectedPersonas: ["Pipeline users"],
    affectedArticleSlugs: ["pipeline-hub-overview", "pipeline-file-workspace"],
    learnMoreSlug: "pipeline-hub-overview",
  },
];
