"use client";

import { appendPriorityDebugClientLog, debugAgentLogPostUrl } from "@/lib/debugClientLog";

/**
 * Loaded from root layout (`DebugEarlyClientBootstrap`) — registers `error` in **capture**
 * phase before most React work, so max-depth / #185 can be captured even when effects
 * do not run. Idempotent if the module is evaluated more than once.
 */

const seen = new Set<string>();
let posted = 0;
const CAP = 25;

function post(kind: string, message: string, stack: string) {
  if (typeof window === "undefined" || posted >= CAP) return;
  const key = `${kind}:${message.slice(0, 240)}`;
  if (seen.has(key)) return;
  seen.add(key);
  posted += 1;

  const payload = {
    sessionId: "f25461",
    runId: "early-tap",
    hypothesisId: "H185_early",
    location: "registerEarlyErrorTap",
    message: message.slice(0, 600),
    data: {
      kind,
      stack: stack.slice(0, 8000),
      posted,
    },
    timestamp: Date.now(),
  };
  appendPriorityDebugClientLog(payload);

  // #region agent log
  void fetch(debugAgentLogPostUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
  // #endregion
}
let listenersInstalled = false;
function installWindowErrorTap(): void {
  if (typeof window === "undefined" || listenersInstalled) return;
  listenersInstalled = true;

  window.addEventListener(
    "error",
    (e: Event) => {
      if (!(e instanceof ErrorEvent)) return;
      const err = e.error;
      const stack = err instanceof Error ? (err.stack ?? "") : "";
      const msg =
        e.message ||
        (err instanceof Error ? err.message : String(err ?? ""));
      post("window.error", msg, stack);
    },
    true,
  );

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const r = e.reason;
    const err = r instanceof Error ? r : null;
    post(
      "unhandledrejection",
      err?.message ?? String(r ?? ""),
      err?.stack ?? "",
    );
  });
}
installWindowErrorTap();

/** Once per tab — proves `/api/debug-agent-log` + ingest path run (debug sessions). */
if (typeof window !== "undefined") {
  queueMicrotask(() => {
    try {
      if (sessionStorage.getItem("dlc.f25461.boot") === "1") return;
      sessionStorage.setItem("dlc.f25461.boot", "1");
    } catch {
      /* private mode */
    }
    appendPriorityDebugClientLog({
      sessionId: "f25461",
      runId: "boot",
      hypothesisId: "H_boot_transport",
      location: "registerEarlyErrorTap:boot",
      message: "early client bootstrap loaded",
      data: {
        path: window.location?.pathname ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
      },
      timestamp: Date.now(),
    });
  });
}
