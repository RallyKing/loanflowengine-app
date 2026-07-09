"use client";

import { FILE_IDLE_MAX_WRITES_PER_MIN } from "@/lib/convexCostBudget";

export type WriteStormEntry = {
  scope: string;
  mutation: string;
  count: number;
  lastAt: number;
  stacks: string[];
};

export type WriteStormReport = {
  windowMs: number;
  writesPerMinute: number;
  totalWrites: number;
  idleViolationCount: number;
  byMutation: Array<{ mutation: string; count: number }>;
  byScope: Array<{ scope: string; count: number }>;
  duplicateCallers: Array<{ key: string; count: number; scopes: string[] }>;
  recent: WriteStormEntry[];
  fileIdleBudgetPerMin: number;
  exceedsFileIdleBudget: boolean;
};

declare global {
  interface Window {
    __dlcWriteStormReport?: () => WriteStormReport;
    __dlcWriteStormReset?: () => void;
    __FORCE_WRITE_STORM_DEBUG__?: boolean;
  }
}

function captureStack(): string {
  try {
    const err = new Error();
    const lines = (err.stack ?? "")
      .split("\n")
      .slice(2, 8)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.join(" | ");
  } catch {
    return "";
  }
}

export function isWriteStormTrackingEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_WRITE_STORM_TRACKING === "1") return true;
  if (typeof window !== "undefined" && window.__FORCE_WRITE_STORM_DEBUG__ === true) {
    return true;
  }
  return typeof window !== "undefined";
}

class WriteStormGovernance {
  private startedAt = Date.now();
  private entries = new Map<string, WriteStormEntry>();
  private idleViolations = 0;
  private lastWarnAt = 0;
  private fileRouteActive = false;

  setFileRouteActive(active: boolean) {
    this.fileRouteActive = active;
  }

  recordMutation(scope: string, mutation: string, stack?: string) {
    const key = `${scope}::${mutation}`;
    const row = this.entries.get(key) ?? {
      scope,
      mutation,
      count: 0,
      lastAt: 0,
      stacks: [],
    };
    row.count += 1;
    row.lastAt = Date.now();
    const stk = stack ?? captureStack();
    if (stk && row.stacks.length < 4 && !row.stacks.includes(stk)) {
      row.stacks.push(stk);
    }
    this.entries.set(key, row);

    const windowMs = Math.max(1, Date.now() - this.startedAt);
    const perMin = (this.totalCount() / windowMs) * 60_000;
    if (
      this.fileRouteActive &&
      perMin > FILE_IDLE_MAX_WRITES_PER_MIN &&
      Date.now() - this.lastWarnAt > 15_000
    ) {
      this.idleViolations += 1;
      this.lastWarnAt = Date.now();
      console.warn(
        `[dlc-write-storm] Pipeline file idle write rate ${perMin.toFixed(2)}/min (budget ${FILE_IDLE_MAX_WRITES_PER_MIN}/min). Top:`,
        this.getReport().byMutation.slice(0, 5),
      );
    }
  }

  private totalCount(): number {
    let n = 0;
    for (const e of this.entries.values()) n += e.count;
    return n;
  }

  getReport(): WriteStormReport {
    const windowMs = Math.max(1, Date.now() - this.startedAt);
    const totalWrites = this.totalCount();
    const writesPerMinute = (totalWrites / windowMs) * 60_000;

    const byMutationMap = new Map<string, number>();
    const byScopeMap = new Map<string, number>();
    for (const e of this.entries.values()) {
      byMutationMap.set(e.mutation, (byMutationMap.get(e.mutation) ?? 0) + e.count);
      byScopeMap.set(e.scope, (byScopeMap.get(e.scope) ?? 0) + e.count);
    }

    const dupMap = new Map<string, { count: number; scopes: string[] }>();
    for (const e of this.entries.values()) {
      const k = e.mutation;
      const row = dupMap.get(k) ?? { count: 0, scopes: [] };
      row.count += e.count;
      if (!row.scopes.includes(e.scope)) row.scopes.push(e.scope);
      dupMap.set(k, row);
    }

    const duplicateCallers = [...dupMap.entries()]
      .filter(([, v]) => v.scopes.length > 1 || v.count > 3)
      .map(([mutation, v]) => ({
        key: mutation,
        count: v.count,
        scopes: v.scopes,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      windowMs,
      writesPerMinute,
      totalWrites,
      idleViolationCount: this.idleViolations,
      byMutation: [...byMutationMap.entries()]
        .map(([mutation, count]) => ({ mutation, count }))
        .sort((a, b) => b.count - a.count),
      byScope: [...byScopeMap.entries()]
        .map(([scope, count]) => ({ scope, count }))
        .sort((a, b) => b.count - a.count),
      duplicateCallers,
      recent: [...this.entries.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, 16),
      fileIdleBudgetPerMin: FILE_IDLE_MAX_WRITES_PER_MIN,
      exceedsFileIdleBudget: writesPerMinute > FILE_IDLE_MAX_WRITES_PER_MIN,
    };
  }

  reset() {
    this.startedAt = Date.now();
    this.entries.clear();
    this.idleViolations = 0;
    this.lastWarnAt = 0;
  }
}

let singleton: WriteStormGovernance | null = null;

export function getWriteStormGovernance(): WriteStormGovernance {
  if (typeof window === "undefined") return new WriteStormGovernance();
  if (!singleton) singleton = new WriteStormGovernance();
  return singleton;
}

export function traceConvexMutation(scope: string, mutation: string) {
  if (!isWriteStormTrackingEnabled()) return;
  getWriteStormGovernance().recordMutation(scope, mutation);
}

export function installWriteStormReportApi() {
  if (typeof window === "undefined") return;
  window.__dlcWriteStormReport = () => getWriteStormGovernance().getReport();
  window.__dlcWriteStormReset = () => getWriteStormGovernance().reset();
}
