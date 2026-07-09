"use client";

import { useSyncExternalStore } from "react";

function subscribeTabVisible(onStoreChange: () => void) {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onStoreChange);
  return () => document.removeEventListener("visibilitychange", onStoreChange);
}

function getTabVisibleClient(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function getTabVisibleServer(): boolean {
  return true;
}

/** True when the browser tab is visible — gate nonessential Convex subscriptions. */
export function useDocumentTabVisible(): boolean {
  return useSyncExternalStore(
    subscribeTabVisible,
    getTabVisibleClient,
    getTabVisibleServer,
  );
}
