/**
 * Phase 24.4M — neon visual isolation for mobile bottom nav (diagnostic).
 * Revert to `false` after device identifies DLC nav vs native browser chrome.
 */
/** Track A closed — diagnostic paint off in production. */
export const PHASE_24_4M_NEON_NAV_ISOLATION = false;

export const PIPELINE_NEON_NAV_HTML_ATTR = "data-pipeline-neon-nav-isolation";

/** Inline styles — unmistakable on device (not token-polished). */
export const NEON_NAV_ISOLATION_STYLE = {
  background: "#bc34fa",
  borderTop: "6px solid #facc15",
  boxShadow: "0 0 0 3px #000, 0 -8px 24px rgba(188,52,250,0.9)",
} as const;
