"use client";

import { useSyncExternalStore } from "react";

/** Matches Tailwind `max-md` (strictly below 768px). */
const MOBILE_MAX_QUERY = "(max-width: 767.98px)";

/** Phase 24.4Q — cached `useNarrowViewport` value on pipeline (no matchMedia churn). */
let pipelineNarrowViewportFrozen: boolean | null = null;

export function setPipelineNarrowViewportFrozen(frozen: boolean): void {
  if (typeof window === "undefined") return;
  pipelineNarrowViewportFrozen = frozen
    ? window.matchMedia(MOBILE_MAX_QUERY).matches
    : null;
}

export function isPipelineNarrowViewportFrozen(): boolean {
  return pipelineNarrowViewportFrozen !== null;
}

function subscribeMobileMax(callback: () => void) {
  if (pipelineNarrowViewportFrozen !== null) {
    return () => {};
  }
  const mq = window.matchMedia(MOBILE_MAX_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getMobileMaxSnapshot() {
  if (pipelineNarrowViewportFrozen !== null) {
    return pipelineNarrowViewportFrozen;
  }
  return window.matchMedia(MOBILE_MAX_QUERY).matches;
}

function getServerMobileMaxSnapshot() {
  return false;
}

/** True on small viewports (mobile / narrow tablet). SSR-safe. */
export function useNarrowViewport() {
  return useSyncExternalStore(
    subscribeMobileMax,
    getMobileMaxSnapshot,
    getServerMobileMaxSnapshot,
  );
}
