/**
 * Phase 24.4L — pipeline mobile nav DOM mount lock (diagnostic).
 * Nav must stay mounted and visible; no focus-hide classes or display:none.
 * Revert to `false` after device verification.
 */
export const PHASE_24_4L_DOM_MOUNT_LOCK = true;

export const PIPELINE_NAV_DOM_LOCK_HTML_ATTR = "data-pipeline-nav-dom-lock";

/** Scorched-earth visibility — never translate off-screen or use display:none. */
export const PIPELINE_BOTTOM_NAV_DOM_LOCK_CLASS =
  "max-md:!flex max-md:!block md:max-xl:!flex !translate-y-0 !translate-none !opacity-100 !pointer-events-auto !visible max-md:!transition-none md:max-xl:!transition-none";
