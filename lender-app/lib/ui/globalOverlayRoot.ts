/**
 * Phase 18.8H — canonical DOM mount for operational overlays (destructive confirm, etc.).
 * Must remain a direct child of `document.body` (see app/layout.tsx).
 */

export const GLOBAL_OVERLAY_ROOT_ID = "dlc-global-overlay-root";

/** @deprecated Use GLOBAL_OVERLAY_ROOT_ID */
export const DESTRUCTIVE_CONFIRM_PORTAL_ID = GLOBAL_OVERLAY_ROOT_ID;

export function getGlobalOverlayRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(GLOBAL_OVERLAY_ROOT_ID);
}

/** Ensures the overlay root exists (layout should always provide it). */
export function ensureGlobalOverlayRoot(): HTMLElement {
  const existing = getGlobalOverlayRoot();
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = GLOBAL_OVERLAY_ROOT_ID;
  el.setAttribute("data-global-overlay-root", "true");
  document.body.appendChild(el);
  return el;
}

export function getGlobalOverlayPortalTarget(): HTMLElement {
  return getGlobalOverlayRoot() ?? ensureGlobalOverlayRoot();
}
