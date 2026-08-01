"use client";

/** Browser ring buffer for NDJSON when `/api/debug-agent-log` cannot reach disk. */
export const DEBUG_CLIENT_LOG_KEY = "dlc.debug.f25461.ndjson";
/** High-signal entries only (H185_*); not mixed with high-frequency telemetry. */
export const DEBUG_CLIENT_PRIORITY_KEY = "dlc.debug.f25461.priority.ndjson";
const MAX_BYTES = 250_000;
const PRIORITY_MAX_BYTES = 120_000;

/** Same-origin absolute URL — avoids rare relative `fetch` issues (embedded/preview hosts). */
export function debugAgentLogPostUrl(): string {
  if (typeof window === "undefined") return "/api/debug-agent-log";
  return new URL("/api/debug-agent-log", window.location.origin).href;
}

export function appendDebugClientLog(payload: Record<string, unknown>): void {
  try {
    const line = `${JSON.stringify(payload)}\n`;
    const prev = localStorage.getItem(DEBUG_CLIENT_LOG_KEY) ?? "";
    localStorage.setItem(DEBUG_CLIENT_LOG_KEY, (prev + line).slice(-MAX_BYTES));
  } catch {
    /* private mode / quota */
  }
}

/** Prefer for `H185_early`, `H185_boundary`, and other rare crash captures. */
export function appendPriorityDebugClientLog(
  payload: Record<string, unknown>,
): void {
  try {
    if (typeof window !== "undefined") {
      const line = `${JSON.stringify(payload)}\n`;
      const prev = localStorage.getItem(DEBUG_CLIENT_PRIORITY_KEY) ?? "";
      localStorage.setItem(
        DEBUG_CLIENT_PRIORITY_KEY,
        (prev + line).slice(-PRIORITY_MAX_BYTES),
      );
    }
  } catch {
    /* private mode / quota */
  }
  if (typeof window === "undefined") return;
  // #region agent log
  try {
    const body = JSON.stringify({
      sessionId: "f25461",
      ...payload,
      timestamp:
        typeof payload.timestamp === "number" ? payload.timestamp : Date.now(),
    });
    if (process.env.NODE_ENV === "development") {
      void fetch(
        "http://127.0.0.1:7412/ingest/32d854df-a7db-4c6f-bb28-ee2545e32c91",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "f25461",
          },
          body,
        },
      ).catch(() => {});
      void fetch(debugAgentLogPostUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      })
        .then((r) => {
          if (!r.ok) {
            console.warn("[debug-agent-log] POST failed", r.status, r.statusText);
          }
        })
        .catch((e) => {
          console.warn("[debug-agent-log] POST error", e);
        });
    }
  } catch {
    /* ignore */
  }
  // #endregion
}

/**
 * POST each priority NDJSON line to `/api/debug-agent-log` so a **local** dev
 * server can append `debug-f25461.log` on disk for the agent to read.
 */
export async function flushPriorityBufferToWorkspaceViaApi(): Promise<{
  posted: number;
  skipped: number;
  failed: number;
}> {
  if (typeof window === "undefined") {
    return { posted: 0, skipped: 0, failed: 0 };
  }
  let raw = "";
  try {
    raw = localStorage.getItem(DEBUG_CLIENT_PRIORITY_KEY) ?? "";
  } catch {
    return { posted: 0, skipped: 0, failed: 0 };
  }
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let posted = 0;
  let skipped = 0;
  let failed = 0;
  /** Slightly under route `MAX_PAYLOAD_BYTES` to account for transport. */
  const cap = 60_000;
  for (const line of lines) {
    if (line.length > cap) {
      skipped += 1;
      continue;
    }
    try {
      const r = await fetch(debugAgentLogPostUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: line,
      });
      if (r.ok) posted += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { posted, skipped, failed };
}
