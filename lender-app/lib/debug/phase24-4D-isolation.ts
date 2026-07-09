/**
 * Phase 24.4D — binary isolation flags (one subsystem at a time).
 *
 * Step order:
 * 1. omitOperationalOrientationStrip
 * 2. omitHierarchyExpandMotion (only if step 1 jump = YES)
 * 3. omitScrollRestoration (only if step 2 jump = YES)
 *
 * Revert each flag to false after the responsible subsystem is identified.
 */

export const PHASE_24_4D_ISOLATION = {
  /** Step 1 proved NOT root cause (24.4E) — strip restored. */
  omitOperationalOrientationStrip: false,
  /** Step 2 — do not enable until step 1 result is jump YES. */
  omitHierarchyExpandMotion: false,
  /** Step 3 — do not enable until step 2 result is jump YES. */
  omitScrollRestoration: false,
} as const;

export type Phase24_4DIsolationStep = keyof typeof PHASE_24_4D_ISOLATION;
