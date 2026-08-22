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
  /**
   * Marks pipeline surfaces for layout CSS. Bottom nav uses aggressive flush
   * home pad (`inset − 28px`, ≥2px) — never force 24px / `1.5rem` on the bar.
   */
  freezeSafeAreaInsets: true,
} as const;

export const PIPELINE_MASTER_LAYOUT_LOCK_HTML_ATTR =
  "data-pipeline-master-layout-lock";

export const PIPELINE_SAFE_AREA_FROZEN_HTML_ATTR =
  "data-pipeline-safe-area-frozen";

/** Legacy names — bottom inset is live env(), not a frozen px stand-in. */
export const PIPELINE_FROZEN_SAFE_TOP_PX = 0;
export const PIPELINE_FROZEN_SAFE_BOTTOM_PX = 0;
