"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  isSettingsSectionId,
  type SettingsSectionId,
} from "@/lib/settingsRegistry";

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function getSnapshot(): SettingsSectionId | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.slice(1);
  return isSettingsSectionId(raw) ? raw : null;
}

function getServerSnapshot(): SettingsSectionId | null {
  return null;
}

/**
 * Current Settings deep-link section from `location.hash`, synced across
 * in-page `#…` navigation without a full reload.
 */
export function useSettingsHashSection(): SettingsSectionId | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Scroll the matching settings `<section>` into view (respect hash on load). */
export function useScrollSettingsSectionIntoView(
  section: SettingsSectionId | null
) {
  useEffect(() => {
    if (!section) return;
    const id = `settings-section-${section}`;
    const run = () => {
      const behavior: ScrollBehavior =
        typeof document !== "undefined" &&
        document.documentElement.getAttribute("data-reduce-motion") === "true"
          ? "auto"
          : "smooth";
      document.getElementById(id)?.scrollIntoView({
        behavior,
        block: "start",
      });
    };
    const t = window.requestAnimationFrame(run);
    return () => window.cancelAnimationFrame(t);
  }, [section]);
}
