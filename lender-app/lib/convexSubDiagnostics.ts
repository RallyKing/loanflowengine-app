"use client";

/**
 * Forensic counters for Convex subscription / mutation churn.
 * Enable via `NEXT_PUBLIC_DEBUG_CONVEX_SUBS=1` (build) or
 * `window.__FORCE_CONVEX_SUB_DEBUG__ = true` before hydration (Playwright).
 */

export type ConvexSubDiagBucket =
  | "ConvexClientProvider"
  | "LiveConnectionProvider"
  | "usePresence"
  | "ActivityTimeline"
  | "GlobalSearchPalette"
  | "NavigationConfigProvider"
  | "usePipelineFileWorkspaceData"
  | "PresenceIndicators"
  | "UnifiedCommunicationPanel"
  | "ThreadPanel"
  | "CommunicationHistoryPanel"
  | "LiveConnectionPill"
  | "SharedWorkspace"
  | "convex-verbose"
  | "unknown";

type CounterMap = Record<string, number>;

export type ConvexSubDiagReport = {
  windowMs: number;
  subsCreate: number;
  subsDispose: number;
  subsResubscribe: number;
  queryArgChurn: number;
  mutations: number;
  presenceHeartbeats: number;
  visibilityEvents: number;
  focusEvents: number;
  pillFlips: number;
  renders: number;
  reconnects: number;
  perMinute: {
    subsCreate: number;
    subsDispose: number;
    mutations: number;
    pillFlips: number;
    renders: number;
    heartbeats: number;
  };
  ranked: Array<{ bucket: string; event: string; count: number }>;
};

declare global {
  interface Window {
    __FORCE_CONVEX_SUB_DEBUG__?: boolean;
    __dlcConvexSubDiag?: ConvexSubDiagnostics;
  }
}

function stableSerialize(value: unknown): string {
  if (value === "skip") return '"skip"';
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  try {
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return String(v);
      return v;
    });
  } catch {
    return String(value);
  }
}

export function isConvexSubDebugEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_DEBUG_CONVEX_SUBS === "1") return true;
  if (typeof window !== "undefined" && window.__FORCE_CONVEX_SUB_DEBUG__ === true) {
    return true;
  }
  return false;
}

export function readConvexVerboseFlag(): boolean {
  return isConvexSubDebugEnabled();
}

class ConvexSubDiagnostics {
  private startedAt = Date.now();
  private counters: CounterMap = {};
  private lastQueryArgs = new Map<string, string>();

  bump(bucket: ConvexSubDiagBucket | string, event: string, n = 1) {
    const key = `${bucket}::${event}`;
    this.counters[key] = (this.counters[key] ?? 0) + n;
  }

  log(group: ConvexSubDiagBucket | string, message: string, detail?: unknown) {
    if (!isConvexSubDebugEnabled()) return;
    const ts = new Date().toISOString().slice(11, 23);
    if (detail === undefined) {
      console.log(`[convex-subs ${ts}]`, group, message);
    } else {
      console.groupCollapsed(`[convex-subs ${ts}] ${group} — ${message}`);
      console.log(detail);
      console.groupEnd();
    }
  }

  recordQueryArgs(scope: string, args: unknown) {
    if (!isConvexSubDebugEnabled()) return;
    const next = stableSerialize(args);
    const prev = this.lastQueryArgs.get(scope);
    if (prev === undefined) {
      this.lastQueryArgs.set(scope, next);
      this.bump(scope, "query-args-init");
      this.log(scope, "query args init", next);
      return;
    }
    if (prev !== next) {
      this.lastQueryArgs.set(scope, next);
      this.bump(scope, "query-args-churn");
      this.bump("unknown", "query-arg-churn-total");
      this.log(scope, "query args CHANGED", { prev, next });
    }
  }

  recordVerboseLine(...args: unknown[]) {
    if (!isConvexSubDebugEnabled()) return;
    const blob = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (/subscribe|subscribed|subscription/i.test(blob)) {
      if (/unsubscribe|dispose|teardown/i.test(blob)) {
        this.bump("convex-verbose", "sub-dispose");
      } else {
        this.bump("convex-verbose", "sub-create");
      }
    }
    if (/resubscribe|re-subscribe/i.test(blob)) {
      this.bump("convex-verbose", "sub-resubscribe");
    }
    if (/reconnect/i.test(blob)) {
      this.bump("convex-verbose", "reconnect");
    }
    this.log("convex-verbose", blob.slice(0, 240), args.length > 1 ? args : undefined);
  }

  recordMutation(scope: string, name?: string) {
    this.bump(scope, name ? `mutation:${name}` : "mutation");
    this.bump("unknown", "mutations-total");
    if (typeof window !== "undefined") {
      void import("@/lib/convexCostGovernance").then(({ getConvexCostGovernance }) => {
        getConvexCostGovernance().recordMutation(scope, name ?? "mutation");
      });
    }
  }

  recordHeartbeat(scope: string) {
    this.bump(scope, "presence-heartbeat");
    this.bump("usePresence", "heartbeat-total");
  }

  recordVisibility(scope: string) {
    this.bump(scope, "visibility");
    this.bump("unknown", "visibility-total");
  }

  recordPillFlip(from: string, to: string) {
    this.bump("LiveConnectionPill", `flip:${from}->${to}`);
    this.bump("LiveConnectionPill", "pill-flip-total");
    this.log("LiveConnectionPill", `state ${from} → ${to}`);
  }

  recordRender(scope: string) {
    this.bump(scope, "render");
  }

  getReport(): ConvexSubDiagReport {
    const windowMs = Math.max(1, Date.now() - this.startedAt);
    const min = windowMs / 60_000;

    let subsCreate = 0;
    let subsDispose = 0;
    let subsResubscribe = 0;
    let queryArgChurn = 0;
    let mutations = 0;
    let presenceHeartbeats = 0;
    let visibilityEvents = 0;
    let pillFlips = 0;
    let renders = 0;
    let reconnects = 0;

    const ranked: Array<{ bucket: string; event: string; count: number }> = [];

    for (const [key, count] of Object.entries(this.counters)) {
      const [bucket, event] = key.split("::");
      ranked.push({ bucket, event, count });
      if (event === "sub-create") subsCreate += count;
      if (event === "sub-dispose") subsDispose += count;
      if (event === "sub-resubscribe") subsResubscribe += count;
      if (event === "query-args-churn") queryArgChurn += count;
      if (event.startsWith("mutation")) mutations += count;
      if (event === "heartbeat-total" || event === "presence-heartbeat") {
        presenceHeartbeats += count;
      }
      if (event === "visibility" || event === "visibility-total") {
        visibilityEvents += count;
      }
      if (event === "pill-flip-total") pillFlips += count;
      if (event === "render") renders += count;
      if (event === "reconnect") reconnects += count;
    }

    ranked.sort((a, b) => b.count - a.count);

    return {
      windowMs,
      subsCreate,
      subsDispose,
      subsResubscribe,
      queryArgChurn,
      mutations,
      presenceHeartbeats,
      visibilityEvents,
      focusEvents: 0,
      pillFlips,
      renders,
      reconnects,
      perMinute: {
        subsCreate: subsCreate / min,
        subsDispose: subsDispose / min,
        mutations: mutations / min,
        pillFlips: pillFlips / min,
        renders: renders / min,
        heartbeats: presenceHeartbeats / min,
      },
      ranked: ranked.slice(0, 24),
    };
  }

  reset() {
    this.startedAt = Date.now();
    this.counters = {};
    this.lastQueryArgs.clear();
  }
}

export function getConvexSubDiagnostics(): ConvexSubDiagnostics {
  if (typeof window === "undefined") {
    return new ConvexSubDiagnostics();
  }
  if (!window.__dlcConvexSubDiag) {
    window.__dlcConvexSubDiag = new ConvexSubDiagnostics();
  }
  return window.__dlcConvexSubDiag;
}

/** Periodic ranked summary in the console (debug sessions only). */
export function startConvexSubDiagnosticsSummary(intervalMs = 30_000) {
  if (!isConvexSubDebugEnabled() || typeof window === "undefined") return () => {};
  const diag = getConvexSubDiagnostics();
  const id = window.setInterval(() => {
    const r = diag.getReport();
    console.groupCollapsed(
      `[convex-subs summary] ${Math.round(r.windowMs / 1000)}s — top churn`,
    );
    console.table(r.ranked.slice(0, 12));
    console.log("perMinute", r.perMinute);
    console.groupEnd();
  }, intervalMs);
  return () => window.clearInterval(id);
}
