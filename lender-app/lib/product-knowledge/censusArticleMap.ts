/**
 * Maps canonical registry IDs → planned encyclopedia article slugs.
 * Phase 1+ uses this to track coverage; Phase 3 validator can flag gaps.
 */

import { PIPELINE_BLOCK_IDS } from "@/lib/pipelineBlockRegistry";
import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";
import { NAV_CATALOG, PIPELINE_SUB_ITEMS } from "@/lib/navigation/navigationCatalog";
import type { ProductKnowledgeCategoryId } from "./types";

/** Legacy help article IDs from helpCenterContent.ts → new slug (usually 1:1). */
export const LEGACY_HELP_ARTICLE_SLUG_MAP: Record<string, string> = {
  "workspace-overview": "workspace-overview",
  "global-search": "global-search",
  "tasks-matrix": "tasks-matrix",
  "pipeline-files": "pipeline-file-overview",
  "contacts-crm": "contacts-crm",
  "lenders-directory": "lenders-directory",
  documents: "documents",
  "activity-feed": "activity-feed",
  "settings-hub": "settings-hub",
  "demo-workspace": "demo-workspace",
  notifications: "notifications",
  "offline-connection": "offline-connection",
};

/** Planned slug per pipeline block — encyclopedia coverage target. */
export const PIPELINE_BLOCK_ARTICLE_SLUGS: Record<PipelineBlockId, string> = {
  fileDetails: "block-file-details",
  fileNotes: "block-file-notes",
  dealWorkspace: "block-deal-workspace",
  licensing: "block-licensing",
  scenarioMatch: "block-scenario-match",
  generateTerms: "block-generate-terms",
  lenders: "block-lenders",
  contacts: "block-contacts",
  feesSplits: "block-fees-splits",
  tasks: "block-tasks",
  people: "block-people",
  archive: "block-archive",
  dangerZone: "block-danger-zone",
  constructionBudget: "block-construction-budget",
  investorExperience: "block-investor-experience",
  pfs: "block-pfs",
};

const PIPELINE_BLOCK_CATEGORY: ProductKnowledgeCategoryId = "pipeline-file";

/** Nav catalog id → { slug, categoryId } for primary routes. */
export const NAV_CATALOG_ARTICLE_TARGETS: Record<
  string,
  { slug: string; categoryId: ProductKnowledgeCategoryId }
> = {
  tasks: { slug: "nav-tasks", categoryId: "tasks" },
  events: { slug: "nav-events", categoryId: "events" },
  contacts: { slug: "nav-contacts", categoryId: "contacts" },
  documents: { slug: "nav-documents", categoryId: "documents" },
  operations: { slug: "nav-operations", categoryId: "operations" },
  shared: { slug: "nav-shared", categoryId: "sharing" },
  activity: { slug: "nav-activity", categoryId: "activity" },
  pipeline: { slug: "nav-pipeline", categoryId: "pipeline-hub" },
  lenders: { slug: "nav-lenders", categoryId: "lenders" },
  settings: { slug: "nav-settings", categoryId: "settings" },
  pipeline_hub: { slug: "pipeline-hub-overview", categoryId: "pipeline-hub" },
  analytics: { slug: "pipeline-analytics", categoryId: "analytics" },
  ledger: { slug: "pipeline-ledger", categoryId: "ledger" },
  licenses: { slug: "pipeline-licenses", categoryId: "pipeline-hub" },
};

/** All registry-derived slugs we expect the encyclopedia to eventually cover. */
export function allTargetArticleSlugs(): string[] {
  const slugs = new Set<string>([
    ...Object.values(LEGACY_HELP_ARTICLE_SLUG_MAP),
    ...Object.values(PIPELINE_BLOCK_ARTICLE_SLUGS),
    ...Object.values(NAV_CATALOG_ARTICLE_TARGETS).map((t) => t.slug),
  ]);
  return [...slugs].sort();
}

/** Slugs covered by current static helpCenterContent (12 articles). */
export function legacyCoveredSlugs(): string[] {
  return Object.values(LEGACY_HELP_ARTICLE_SLUG_MAP);
}

/** Registry IDs with no static help article yet. */
export function registryCoverageGaps(): {
  navIds: string[];
  blockIds: PipelineBlockId[];
} {
  const legacySlugs = new Set(legacyCoveredSlugs());
  const navIds = [
    ...NAV_CATALOG.map((e) => e.id),
    ...PIPELINE_SUB_ITEMS.map((e) => e.id),
  ].filter((id) => {
    const target = NAV_CATALOG_ARTICLE_TARGETS[id];
    return target && !legacySlugs.has(target.slug);
  });
  const blockIds = PIPELINE_BLOCK_IDS.filter(
    (id) => !legacySlugs.has(PIPELINE_BLOCK_ARTICLE_SLUGS[id]),
  );
  return { navIds, blockIds };
}

export { PIPELINE_BLOCK_CATEGORY };
