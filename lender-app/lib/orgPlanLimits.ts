import type { OrganizationPlan } from "./orgPlanFeatures";

/** Shown in thrown errors and UI when a hard cap is reached. */
export const PLAN_LIMIT_UPGRADE_PATH =
  "Settings → Team billing (or ask an admin to upgrade).";

/**
 * Maximum pipeline files per org. `null` means no hard cap (Enterprise).
 */
export function maxPipelineFilesForPlan(plan: OrganizationPlan): number | null {
  switch (plan) {
    case "basic":
      return 25;
    case "pro":
      return 250;
    case "enterprise":
      return null;
  }
}

/**
 * Maximum organization seats (rows in `organizationMembers`). `null` = unlimited.
 */
export function maxOrgMembersForPlan(plan: OrganizationPlan): number | null {
  switch (plan) {
    case "basic":
      return 5;
    case "pro":
      return 25;
    case "enterprise":
      return null;
  }
}
