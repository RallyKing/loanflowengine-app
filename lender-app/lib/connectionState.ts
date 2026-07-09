import type { ConnectionState } from "convex/browser";

/**
 * Map Convex WebSocket `ConnectionState` to SignalR-style phases:
 * persistent connection, client reconnect with backoff, and live-query
 * resubscription when the channel is back. Consumed by `lib/liveConnection.tsx`
 * (single `LiveConnectionProvider` for the app, analogous to one SignalR hub).
 */
export type LiveConnectionPhase = "connecting" | "connected" | "reconnecting";

export function liveConnectionPhase(
  s: ConnectionState
): LiveConnectionPhase {
  if (s.isWebSocketConnected) return "connected";
  if (s.hasEverConnected) return "reconnecting";
  return "connecting";
}

export function connectionStatusMessage(
  phase: LiveConnectionPhase
): string {
  switch (phase) {
    case "connecting":
      return "Connect live data — opening the real-time channel…";
    case "reconnecting":
      return "Live data channel dropped — restoring connection…";
    case "connected":
      return "";
  }
}
