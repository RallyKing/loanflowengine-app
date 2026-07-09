/**
 * Phase 24.4J — pipeline bottom nav must never slide off-screen during scroll.
 * Revert to `false` after scroll jump is confirmed fixed.
 */
export const PHASE_24_4J_PIPELINE_NAV_LOCK = true;

/** Immutable visibility — no translate/opacity hide utilities. */
export const PIPELINE_BOTTOM_NAV_FORCE_VISIBLE_CLASS =
  "max-md:!translate-y-0 max-md:!translate-none max-md:!opacity-100 max-md:!pointer-events-auto md:max-xl:!translate-y-0 md:max-xl:!translate-none md:max-xl:!opacity-100 md:max-xl:!pointer-events-auto";
