"use client";

import { WifiOff, Loader2 } from "lucide-react";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { connectionStatusMessage } from "@/lib/connectionState";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

const isDev = process.env.NODE_ENV === "development";

/**
 * Subscribes to the Convex real-time connection (WebSocket) — analogous to
 * a SignalR hub. Also surfaces browser offline (transport) vs server-side
 * reconnection.
 * `data-hub-state`: `browser-offline` | `connecting` | `reconnecting` (for E2E / automation).
 */
export function ConvexConnectionStatus() {
  const { phase, isLive, browserOnline, state: s, reconnectingDetail } =
    useLiveConnection();
  const message = connectionStatusMessage(phase);

  if (isLive && browserOnline) {
    return null;
  }

  if (!browserOnline) {
    return (
      <div
        data-hub-state="browser-offline"
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center gap-0.5 border-b border-border bg-muted px-4 py-1.5 text-center text-xs text-foreground"
      >
        <div className="flex items-center justify-center gap-2">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            No network (browser is offline). Reconnect to sync with the server.
          </span>
        </div>
      </div>
    );
  }

  const isFirstConnect = phase === "connecting";
  const showDetails =
    isDev &&
    (s.connectionRetries > 0 || s.inflightMutations + s.inflightActions > 0);

  return (
    <div
      data-hub-state={phase}
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 border-b px-4 py-1.5 text-center text-xs",
        isFirstConnect &&
          "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/50 dark:text-amber-100",
        phase === "reconnecting" &&
          "border-orange-200/80 bg-orange-50 text-orange-900 dark:border-orange-800/50 dark:bg-orange-950/50 dark:text-orange-100"
      )}
    >
      <div className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-2">
        {isFirstConnect ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        ) : (
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span>{message}</span>
        {showDetails && (
          <span className="text-[10px] opacity-80 tabular-nums">
            retries={s.connectionRetries} conns={s.connectionCount} mut=
            {s.inflightMutations} act={s.inflightActions}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-[11px]",
            isFirstConnect &&
              "border-amber-300/80 bg-white/60 text-amber-950 hover:bg-white dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-50",
            phase === "reconnecting" &&
              "border-orange-300/80 bg-white/60 text-orange-950 hover:bg-white dark:border-orange-700/60 dark:bg-orange-900/30 dark:text-orange-50"
          )}
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          Refresh
        </Button>
      </div>
      {reconnectingDetail && (
        <p className="text-[11px] opacity-90">{reconnectingDetail}</p>
      )}
    </div>
  );
}
