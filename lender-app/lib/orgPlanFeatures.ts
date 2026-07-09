import {
  ALL_PIPELINE_BLOCK_IDS,
  type PipelineBlockId,
} from "./pipelineBlockRegistry";
import type { PipelineDrawerLayoutV1 } from "./pipelineDrawerLayoutStorage";

export const ORGANIZATION_PLANS = ["basic", "pro", "enterprise"] as const;
export type OrganizationPlan = (typeof ORGANIZATION_PLANS)[number];

export type OrgFeatureKey = "advanced_blocks" | "automation" | "integrations";

const FEATURE_MATRIX: Record<OrganizationPlan, Record<OrgFeatureKey, boolean>> =
  {
    basic: {
      advanced_blocks: false,
      automation: false,
      integrations: false,
    },
    pro: {
      advanced_blocks: true,
      automation: true,
      integrations: false,
    },
    enterprise: {
      advanced_blocks: true,
      automation: true,
      integrations: true,
    },
  };

export function normalizeOrganizationPlan(
  raw: string | undefined | null,
): OrganizationPlan {
  if (raw === "pro" || raw === "enterprise") return raw;
  return "basic";
}

export function planHasFeature(
  plan: OrganizationPlan,
  feature: OrgFeatureKey,
): boolean {
  return FEATURE_MATRIX[plan][feature];
}

/**
 * Pipeline drawer blocks-gated under `advanced_blocks` (Pro+).
 */
export const ADVANCED_PIPELINE_BLOCK_IDS: ReadonlySet<PipelineBlockId> =
  new Set([
    "scenarioMatch",
    "generateTerms",
    "feesSplits",
    "archive",
    "dangerZone",
  ]);

export function layoutExposesAdvancedBlock(
  layout: PipelineDrawerLayoutV1,
): boolean {
  const hidden = new Set(layout.hidden);
  for (const id of layout.order) {
    if (
      ADVANCED_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId) &&
      !hidden.has(id)
    ) {
      return true;
    }
  }
  return false;
}

export function adminRequiredReferencesAdvanced(
  adminRequiredBlockIds: readonly string[],
): boolean {
  return adminRequiredBlockIds.some((id) =>
    ADVANCED_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId),
  );
}

/** Hide advanced blocks when the org plan does not include them (new-file layouts). */
export function stripAdvancedBlocksHiddenForPlan(
  layout: PipelineDrawerLayoutV1,
  plan: OrganizationPlan,
): PipelineDrawerLayoutV1 {
  if (planHasFeature(plan, "advanced_blocks")) return layout;
  const hidden = new Set(layout.hidden);
  for (const id of ADVANCED_PIPELINE_BLOCK_IDS) {
    if (ALL_PIPELINE_BLOCK_IDS.has(id)) hidden.add(id);
  }
  return { ...layout, hidden: [...hidden] };
}

export function userWorkflowRulesUseIntegrations(
  rules: ReadonlyArray<{ action: { type: string } }>,
): boolean {
  return rules.some((r) => r.action.type === "enqueue_integration_job");
}
