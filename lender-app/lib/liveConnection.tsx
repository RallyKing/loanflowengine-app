"use client";

import {
  createContext,
  useCallback,
  useContext,
  useDebugValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConvexConnectionState } from "convex/react";
import {
  liveConnectionPhase,
  type LiveConnectionPhase,
} from "@/lib/connectionState";
import { useBrowserOnline } from "@/lib/useBrowserOnline";
import { useConvexSubMountTrace } from "@/lib/convexSubDiagnosticsHooks";

const RETRY_COPY_THRESHOLD = 2;

/**
 * One subscription to Convex + browser (SignalR-style “one hub” for the app).
 * @internal
 */
function useLiveConnectionValue() {
  const browserOnline = useBrowserOnline();
  const s = useConvexConnectionState();
  const phase = useMemo(
    () => liveConnectionPhase(s),
    [s]
  );
  const isLive = phase === "connected";
  // Trust the Convex WebSocket — `navigator.onLine` is often wrong on Windows/Chrome
  // and would keep `canUseHub` false even when the client is live.
  const canUseHub = isLive;
  const reconnectingDetail = useMemo(() => {
    if (phase !== "reconnecting") return null;
    if (s.connectionRetries > RETRY_COPY_THRESHOLD) {
      return "If this persists, check your network or VPN.";
    }
    return null;
  }, [phase, s.connectionRetries]);

  /** Raw transport signal — includes brief query/action receive windows. */
  const hasPendingInvocationsRaw = useMemo(
    () =>
      s.inflightMutations > 0 ||
      s.inflightActions > 0 ||
      s.hasInflightRequests,
    [s.inflightMutations, s.inflightActions, s.hasInflightRequests]
  );

  /**
   * Debounce sub-second inflight flicker so the header pill does not oscillate
   * on every subscription push (measured via convex-subs forensics).
   */
  const [hasPendingInvocations, setHasPendingInvocations] = useState(false);
  const pendingTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (hasPendingInvocationsRaw) {
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      setHasPendingInvocations(true);
      return;
    }
    if (pendingTimerRef.current !== null) return;
    pendingTimerRef.current = window.setTimeout(() => {
      pendingTimerRef.current = null;
      setHasPendingInvocations(false);
    }, 280);
    return () => {
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, [hasPendingInvocationsRaw]);

  const actionTitle = useCallback(
    (whenConnected: string) =>
      liveActionTitle(canUseHub, whenConnected, browserOnline),
    [canUseHub, browserOnline]
  );

  return useMemo(
    () => ({
      phase,
      isLive,
      browserOnline,
      canUseHub,
      state: s,
      reconnectingDetail,
      hasPendingInvocations,
      actionTitle,
    }),
    [
      phase,
      isLive,
      browserOnline,
      canUseHub,
      s,
      reconnectingDetail,
      hasPendingInvocations,
      actionTitle,
    ]
  );
}

export type UseLiveConnectionResult = ReturnType<typeof useLiveConnectionValue>;

const LiveConnectionContext = createContext<UseLiveConnectionResult | null>(
  null
);

/**
 * Mount once under `ConvexProvider` so the whole app shares one connection
 * snapshot (WebSocket + transport + action titles). The context value is
 * memoized so “hub” state only propagates when Convex/browser signals change
 * (SignalR-style: fewer no-op re-renders on unrelated tree updates).
 */
export function LiveConnectionProvider({ children }: { children: ReactNode }) {
  const value = useLiveConnectionValue();
  useConvexSubMountTrace("LiveConnectionProvider");
  useDebugValue(value, formatLiveConnectionDebug);
  return (
    <LiveConnectionContext.Provider value={value}>
      {children}
    </LiveConnectionContext.Provider>
  );
}

LiveConnectionProvider.displayName = "LiveConnectionProvider";

/** For React `useDebugValue` — read like a SignalR connection: phase + can invoke + network. */
export function formatLiveConnectionDebug(
  v: UseLiveConnectionResult
): string {
  const action =
    v.canUseHub
      ? "ok"
      : !v.browserOnline
        ? "offline"
        : "awaitSocket";
  const inv = v.hasPendingInvocations ? " · inFlight" : "";
  const retry =
    v.state.connectionRetries > 0
      ? ` · r${v.state.connectionRetries}`
      : "";
  return `phase:${v.phase} · action:${action}${inv}${retry}`;
}

/** Returns null when Convex / LiveConnectionProvider is not mounted (e.g. config shell). */
export function useLiveConnectionOptional(): UseLiveConnectionResult | null {
  return useContext(LiveConnectionContext);
}

export function useLiveConnection(): UseLiveConnectionResult {
  const v = useLiveConnectionOptional();
  useDebugValue(
    v,
    (x) => (x ? formatLiveConnectionDebug(x) : "no LiveConnectionProvider")
  );
  if (v === null) {
    throw new Error(
      "useLiveConnection must be used within LiveConnectionProvider (wrap the app in ConvexClientProvider, which includes it)."
    );
  }
  return v;
}

export function liveActionTitle(
  canUseHub: boolean,
  whenConnected: string,
  browserOnline: boolean
): string {
  if (canUseHub) return whenConnected;
  if (!browserOnline) {
    return "You appear to be offline. Reconnect, then try again.";
  }
  return "Connect live data — the channel is still opening or reconnecting. Try again in a moment, or refresh the page.";
}

export function livePhaseLabel(phase: LiveConnectionPhase): string {
  switch (phase) {
    case "connecting":
      return "Connect live data";
    case "reconnecting":
      return "Restoring live data";
    case "connected":
      return "Live";
  }
}
