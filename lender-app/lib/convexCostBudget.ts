/**
 * Phase 11.1 — hard Convex cost budgets (enforced in e2e + operator reports).
 * Units are relative "cost points" for estimation, not literal Convex billing dollars.
 */

/** Hub idle: max sustained query subscriptions worth ~0.5/sec equivalent. */
export const HUB_IDLE_MAX_QUERY_SUBS = 6;

/** File workspace idle: max active subscriptions. */
export const FILE_IDLE_MAX_QUERY_SUBS = 12;

/** Max hub idle query-equivalent rate (subscriptions × push factor / window). */
export const HUB_IDLE_MAX_QUERY_RATE_PER_SEC = 0.5;

/** Max file idle query-equivalent rate. */
export const FILE_IDLE_MAX_QUERY_RATE_PER_SEC = 1.0;

/** Presence heartbeats per active user per minute (hard throttle). */
export const PRESENCE_MAX_WRITES_PER_MIN = 1;

/** Pipeline file idle: max Convex mutations per minute while untouched. */
export const FILE_IDLE_MAX_WRITES_PER_MIN = 2;

/** Pipeline file 5-minute idle soak: max total mutations allowed. */
export const PIPELINE_FILE_IDLE_MAX_TOTAL_WRITES = 2;

/** Pipeline hub hierarchy 5-minute idle soak: max total mutations (expansion is localStorage only). */
export const HUB_IDLE_MAX_TOTAL_WRITES = 2;

/** Pipeline hub idle: max mutations per minute while untouched. */
export const HUB_IDLE_MAX_WRITES_PER_MIN = 0.5;

/** Activity cosmetic duplicate events per minute per file. */
export const ACTIVITY_COSMETIC_MAX_PER_MIN = 8;

/** Monthly relative cost budget (extrapolated from idle + typical use). */
export const MONTHLY_COST_BUDGET_UNITS = 120_000;

/** Relative weights for cost estimation. */
export const COST_WEIGHT = {
  mutation: 100,
  subscriptionMinute: 10,
  presenceWrite: 80,
  activityWrite: 40,
  notificationWrite: 30,
  searchReindexWrite: 25,
} as const;
