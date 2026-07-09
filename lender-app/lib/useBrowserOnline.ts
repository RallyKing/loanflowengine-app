"use client";

import { useSyncExternalStore } from "react";

/**
 * `navigator.onLine` — transport layer, complementary to the Convex WebSocket
 * (SignalR-style: client can be “disconnected” from the network even when the
 * hub client is still trying to reconnect).
 */
function subscribeOnline(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getOnlineClient() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

function getOnlineServer() {
  return true;
}

export function useBrowserOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    getOnlineClient,
    getOnlineServer
  );
}
