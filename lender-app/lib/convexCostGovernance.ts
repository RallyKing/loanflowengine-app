"use client";

import {
  COST_WEIGHT,
  MONTHLY_COST_BUDGET_UNITS,
  PRESENCE_MAX_WRITES_PER_MIN,
} from "@/lib/convexCostBudget";
import { estimateRouteIdleQueryRatePerSec } from "@/lib/convexCostEstimate";
import { getConvexSubDiagnostics, isConvexSubDebugEnabled } from "@/lib/convexSubDiagnostics";

export type ConvexCostRoute =
  | "hub"
  | "file"
  | "activity"
  | "shared"
  | "settings"
  | "communications"
  | "drawer"
  | "shell"
  | "unknown";

export type ActiveSubscription = {
  scope: string;
  queryKey: string;
  argsFingerprint: string;
  route: ConvexCostRoute;
  since: number;
};

export type ConvexCostReport = {
  windowMs: number;
  activeSubscriptions: ActiveSubscription[];
  activeSubscriptionCount: number;
  writesPerMinute: number;
  mutationsPerMinute: number;
  presenceWritesPerMinute: number;
  presenceThrottleSkips: number;
  duplicateSubscriptions: Array<{
    queryKey: string;
    count: number;
    scopes: string[];
  }>;
  topMutationCallers: Array<{ scope: string; name: string; count: number }>;
  queryArgChurnPerMinute: number;
  estimatedMonthlyCostUnits: number;
  monthlyBudgetUnits: number;
  withinBudget: boolean;
  rankedOffenders: Array<{ scope: string; metric: string; ratePerMin: number; weight: number }>;
  idleQueryRatePerSec: { hub: number; file: number; shell: number };
};

declare global {
  interface Window {
    __dlcConvexCostReport?: () => ConvexCostReport;
    __dlcConvexCostReset?: () => void;
    __FORCE_CONVEX_COST_DEBUG__?: boolean;
  }
}

function stableSerialize(value: unknown): string {
  if (value === "skip") return '"skip"';
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value, (_k, v) =>
      typeof v === "bigint" ? String(v) : v,
    );
  } catch {
    return String(value);
  }
}

export function isConvexCostTrackingEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_COST_TRACKING === "1") return true;
  if (typeof window !== "undefined" && window.__FORCE_CONVEX_COST_DEBUG__ === true) {
    return true;
  }
  return isConvexSubDebugEnabled();
}

class ConvexCostGovernance {
  private startedAt = Date.now();
  private activeSubs = new Map<string, ActiveSubscription>();
  private mutationCounts = new Map<string, number>();
  private presenceWrites = 0;
  private presenceThrottleSkips = 0;
  private lastPresenceWriteAt = 0;
  private queryArgChurn = 0;
  private lastQueryArgs = new Map<string, string>();

  /** Hard client gate: max 1 presence write per 60s. */
  canSendPresenceWrite(): boolean {
    const now = Date.now();
    if (now - this.lastPresenceWriteAt < 60_000) {
      this.presenceThrottleSkips += 1;
      return false;
    }
    return true;
  }

  recordPresenceWriteSent() {
    this.lastPresenceWriteAt = Date.now();
    this.presenceWrites += 1;
    this.recordMutation("usePresence", "heartbeat");
    getConvexSubDiagnostics().recordHeartbeat("usePresence");
  }

  registerSubscription(args: {
    scope: string;
    queryKey: string;
    queryArgs: unknown;
    route?: ConvexCostRoute;
  }) {
    if (args.queryArgs === "skip") {
      this.unregisterSubscription(args.scope);
      return;
    }
    const fp = stableSerialize(args.queryArgs);
    const id = `${args.scope}::${args.queryKey}`;
    this.activeSubs.set(id, {
      scope: args.scope,
      queryKey: args.queryKey,
      argsFingerprint: fp,
      route: args.route ?? "unknown",
      since: Date.now(),
    });
    const prev = this.lastQueryArgs.get(id);
    if (prev !== undefined && prev !== fp) {
      this.queryArgChurn += 1;
    }
    this.lastQueryArgs.set(id, fp);
  }

  unregisterSubscription(scope: string) {
    for (const [key, sub] of this.activeSubs) {
      if (sub.scope === scope || key.startsWith(`${scope}::`)) {
        this.activeSubs.delete(key);
      }
    }
  }

  recordMutation(scope: string, name: string) {
    const key = `${scope}::${name}`;
    this.mutationCounts.set(key, (this.mutationCounts.get(key) ?? 0) + 1);
  }

  getCostReport(): ConvexCostReport {
    const windowMs = Math.max(1, Date.now() - this.startedAt);
    const min = windowMs / 60_000;

    const activeSubscriptions = [...this.activeSubs.values()];
    const subKeyCounts = new Map<
      string,
      { count: number; scopes: string[] }
    >();
    for (const s of activeSubscriptions) {
      const k = `${s.queryKey}::${s.argsFingerprint}`;
      const row = subKeyCounts.get(k) ?? { count: 0, scopes: [] };
      row.count += 1;
      row.scopes.push(s.scope);
      subKeyCounts.set(k, row);
    }

    const duplicateSubscriptions = [...subKeyCounts.entries()]
      .filter(([, v]) => v.count > 1)
      .map(([queryKey, v]) => ({
        queryKey: queryKey.slice(0, 120),
        count: v.count,
        scopes: v.scopes,
      }))
      .sort((a, b) => b.count - a.count);

    const topMutationCallers = [...this.mutationCounts.entries()]
      .map(([key, count]) => {
        const [scope, name] = key.split("::");
        return { scope, name, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const mutationsPerMinute =
      topMutationCallers.reduce((s, r) => s + r.count, 0) / min;
    const presenceWritesPerMinute = this.presenceWrites / min;
    const writesPerMinute = mutationsPerMinute;

    const subDiag = getConvexSubDiagnostics().getReport();

    const estimatedMonthlyCostUnits = Math.round(
      mutationsPerMinute * COST_WEIGHT.mutation * 43_200 +
        activeSubscriptions.length *
          COST_WEIGHT.subscriptionMinute *
          43_200 +
        presenceWritesPerMinute * COST_WEIGHT.presenceWrite * 43_200,
    );

    const rankedOffenders: ConvexCostReport["rankedOffenders"] = [
      {
        scope: "presence",
        metric: "writes/min",
        ratePerMin: presenceWritesPerMinute,
        weight: COST_WEIGHT.presenceWrite,
      },
      {
        scope: "mutations",
        metric: "total/min",
        ratePerMin: mutationsPerMinute,
        weight: COST_WEIGHT.mutation,
      },
      {
        scope: "subscriptions",
        metric: "active count",
        ratePerMin: activeSubscriptions.length,
        weight: COST_WEIGHT.subscriptionMinute,
      },
      {
        scope: "query-args",
        metric: "churn/min",
        ratePerMin: this.queryArgChurn / min,
        weight: 15,
      },
      ...topMutationCallers.slice(0, 5).map((m) => ({
        scope: m.scope,
        metric: `mutation:${m.name}`,
        ratePerMin: m.count / min,
        weight: COST_WEIGHT.mutation,
      })),
    ].sort((a, b) => b.ratePerMin * b.weight - a.ratePerMin * a.weight);

    return {
      windowMs,
      activeSubscriptions,
      activeSubscriptionCount: activeSubscriptions.length,
      writesPerMinute,
      mutationsPerMinute,
      presenceWritesPerMinute,
      presenceThrottleSkips: this.presenceThrottleSkips,
      duplicateSubscriptions,
      topMutationCallers,
      queryArgChurnPerMinute: this.queryArgChurn / min,
      estimatedMonthlyCostUnits,
      monthlyBudgetUnits: MONTHLY_COST_BUDGET_UNITS,
      withinBudget: estimatedMonthlyCostUnits <= MONTHLY_COST_BUDGET_UNITS,
      rankedOffenders: rankedOffenders.slice(0, 10),
      idleQueryRatePerSec: {
        hub: estimateRouteIdleQueryRatePerSec(
          activeSubscriptions,
          "hub",
          this.queryArgChurn / min,
        ),
        file: estimateRouteIdleQueryRatePerSec(
          activeSubscriptions,
          "file",
          this.queryArgChurn / min,
        ),
        shell: estimateRouteIdleQueryRatePerSec(
          activeSubscriptions,
          "shell",
          this.queryArgChurn / min,
        ),
      },
    };
  }

  reset() {
    this.startedAt = Date.now();
    this.activeSubs.clear();
    this.mutationCounts.clear();
    this.presenceWrites = 0;
    this.presenceThrottleSkips = 0;
    this.lastPresenceWriteAt = 0;
    this.queryArgChurn = 0;
    this.lastQueryArgs.clear();
    getConvexSubDiagnostics().reset();
  }
}

let singleton: ConvexCostGovernance | null = null;

export function getConvexCostGovernance(): ConvexCostGovernance {
  if (typeof window === "undefined") {
    return new ConvexCostGovernance();
  }
  if (!singleton) singleton = new ConvexCostGovernance();
  return singleton;
}

export function installConvexCostReportApi() {
  if (typeof window === "undefined") return;
  window.__dlcConvexCostReport = () => getConvexCostGovernance().getCostReport();
  window.__dlcConvexCostReset = () => getConvexCostGovernance().reset();
}

export { PRESENCE_MAX_WRITES_PER_MIN };
