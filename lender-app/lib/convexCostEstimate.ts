import type { ActiveSubscription } from "@/lib/convexCostGovernance";

/** Settled idle push proxy per active Convex subscription (queries/sec). */
export const SUBSCRIPTION_IDLE_PUSH_FACTOR = 0.04;

export function countSubscriptionsByRoute(
  subs: ActiveSubscription[],
  route: string,
): number {
  return subs.filter((s) => s.route === route).length;
}

/** Estimate idle query-equivalent rate for a route (used by e2e budget gate). */
export function estimateRouteIdleQueryRatePerSec(
  subs: ActiveSubscription[],
  route: string,
  queryArgChurnPerMinute: number,
): number {
  const routeSubs = countSubscriptionsByRoute(subs, route);
  return routeSubs * SUBSCRIPTION_IDLE_PUSH_FACTOR + queryArgChurnPerMinute / 60;
}
