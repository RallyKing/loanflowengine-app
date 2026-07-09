/**
 * Semantic trust token registry — meaning roles decoupled from brand CTAs.
 * CSS variables live in `app/globals.css`; utilities: `dlc-semantic-*`, `dlc-alert-*`.
 *
 * Use for: badges, alerts, validation, activity states, pipeline *meaning* (not stage chrome).
 * Do not replace: `--primary`, `--brand-accent` for main actions / nav branding.
 */

export const semanticCssVars = {
  success: {
    container: "--dlc-semantic-success-container",
    onContainer: "--dlc-semantic-success-on-container",
    border: "--dlc-semantic-success-border",
  },
  warning: {
    container: "--dlc-semantic-warning-container",
    onContainer: "--dlc-semantic-warning-on-container",
    border: "--dlc-semantic-warning-border",
  },
  error: {
    container: "--dlc-semantic-error-container",
    onContainer: "--dlc-semantic-error-on-container",
    border: "--dlc-semantic-error-border",
  },
  info: {
    container: "--dlc-semantic-info-container",
    onContainer: "--dlc-semantic-info-on-container",
    border: "--dlc-semantic-info-border",
  },
  attention: {
    container: "--dlc-semantic-attention-container",
    onContainer: "--dlc-semantic-attention-on-container",
    border: "--dlc-semantic-attention-border",
  },
  neutral: {
    container: "--dlc-semantic-neutral-container",
    onContainer: "--dlc-semantic-neutral-on-container",
    border: "--dlc-semantic-neutral-border",
  },
  pending: {
    container: "--dlc-semantic-pending-container",
    onContainer: "--dlc-semantic-pending-on-container",
    border: "--dlc-semantic-pending-border",
  },
  approved: {
    container: "--dlc-semantic-approved-container",
    onContainer: "--dlc-semantic-approved-on-container",
    border: "--dlc-semantic-approved-border",
  },
  declined: {
    container: "--dlc-semantic-declined-container",
    onContainer: "--dlc-semantic-declined-on-container",
    border: "--dlc-semantic-declined-border",
  },
  active: {
    container: "--dlc-semantic-active-container",
    onContainer: "--dlc-semantic-active-on-container",
    border: "--dlc-semantic-active-border",
  },
  inactive: {
    container: "--dlc-semantic-inactive-container",
    onContainer: "--dlc-semantic-inactive-on-container",
    border: "--dlc-semantic-inactive-border",
  },
  destructive: {
    container: "--dlc-semantic-destructive-container",
    onContainer: "--dlc-semantic-destructive-on-container",
    border: "--dlc-semantic-destructive-border",
    emphasis: "--dlc-semantic-destructive-emphasis",
  },
  surfaces: {
    page: "--dlc-semantic-surface-page",
    container: "--dlc-semantic-surface-container",
    containerHigh: "--dlc-semantic-surface-container-high",
    elevated: "--dlc-semantic-surface-elevated",
  },
} as const;

/** Badge / pill utility: `dlc-semantic-badge` + `dlc-semantic-{role}` */
export const semanticBadgeClasses = {
  success: "dlc-semantic-badge dlc-semantic-success",
  warning: "dlc-semantic-badge dlc-semantic-warning",
  error: "dlc-semantic-badge dlc-semantic-error",
  info: "dlc-semantic-badge dlc-semantic-info",
  attention: "dlc-semantic-badge dlc-semantic-attention",
  neutral: "dlc-semantic-badge dlc-semantic-neutral",
  pending: "dlc-semantic-badge dlc-semantic-pending",
  approved: "dlc-semantic-badge dlc-semantic-approved",
  declined: "dlc-semantic-badge dlc-semantic-declined",
  active: "dlc-semantic-badge dlc-semantic-active",
  inactive: "dlc-semantic-badge dlc-semantic-inactive",
  destructive: "dlc-semantic-badge dlc-semantic-destructive",
} as const;

export type SemanticBadgeRole = keyof typeof semanticBadgeClasses;

/** Mapping notes for pipeline / activity (product copy, not automatic): */
export const semanticRoleIntent: Record<SemanticBadgeRole, string> = {
  success: "Completed, healthy, or positive outcome",
  warning: "Reversible risk or needs awareness (not brand gold)",
  error: "Blocking problem or failed operation",
  info: "Neutral informational state",
  attention: "Requires review — distinct from warning (violet tone)",
  neutral: "Idle, unspecified, or catalog labels",
  pending: "In flight, waiting on external party",
  approved: "Explicit approval / pass",
  declined: "Explicit rejection",
  active: "Current selection or live row",
  inactive: "Archived, disabled display, or deprioritized",
  destructive: "Data loss or irreversible action context (soft surface; buttons use --destructive)",
};
