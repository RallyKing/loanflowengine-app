/**
 * Phase 24.4P — master layout, top header, and safe-area lockdown on `/pipeline`.
 *
 * Targets momentum scroll jumps from shell chrome shifting (not list virtualization).
 */
export const PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN = {
  /** Fixed h-16 top header; no scroll-linked compression/transform. */
  lockTopHeader: true,
  /** Hub orientation strip + any `.sticky` under `[data-pipeline-page-root]` → relative. */
  purgeHubSticky: true,
  /** Static safe-area stand-ins (pb-6 bottom) instead of dynamic `env()`. */
  freezeSafeAreaInsets: true,
} as const;

export const PIPELINE_MASTER_LAYOUT_LOCK_HTML_ATTR =
  "data-pipeline-master-layout-lock";

export const PIPELINE_SAFE_AREA_FROZEN_HTML_ATTR =
  "data-pipeline-safe-area-frozen";

/** Frozen stand-ins when URL bar collapses (24px ≈ Tailwind `pb-6`). */
export const PIPELINE_FROZEN_SAFE_TOP_PX = 0;
export const PIPELINE_FROZEN_SAFE_BOTTOM_PX = 24;
