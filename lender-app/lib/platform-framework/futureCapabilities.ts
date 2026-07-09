/**
 * Layout / capability placeholders — **types and constants only**.
 * Product work wires routes/components incrementally; do not introduce parallel shells.
 */

/** Tablet split: primary record + secondary context (tasks, inspector rail). */
export type TabletSplitPreset =
  | "single"
  | "60-40"
  | "inspector-rail-fixed"
  | "inspector-rail-overlay";

/** Persistent inspector: docked next to main vs overlay `RecordInspectorShell`. */
export type InspectorRailMode = "overlay" | "split_docked" | "hidden";

export type MaterialHarmonizationPhase =
  | "classic"
  | "semantic_roles"
  | "dynamic_color_ready"
  | "tenant_seed_palette";

export type AutomationVisibilityTier =
  | "operator_only"
  | "file_timeline"
  | "playbooks"
  | "enterprise_audit_export";

export type AiWorkflowAssistanceTier =
  | "off"
  | "suggestions_only"
  | "draft_with_approval"
  | "enterprise_governed";

export type EnterpriseAnalyticsMaturity =
  | "none"
  | "usage_counters"
  | "funnel_exports"
  | "warehouse_sink_ready";

export type MultiTenantScaleTrack =
  | "single_org"
  | "org_sharding"
  | "regional_cells"
  | "cell_federation";

/** Doc-only registry for roadmaps — not runtime feature flags. */
export const PLATFORM_CAPABILITY_REGISTRY = {
  tabletSplitPresets: [
    "single",
    "60-40",
    "inspector-rail-fixed",
    "inspector-rail-overlay",
  ] as const satisfies readonly TabletSplitPreset[],
  materialPhases: [
    "classic",
    "semantic_roles",
    "dynamic_color_ready",
    "tenant_seed_palette",
  ] as const satisfies readonly MaterialHarmonizationPhase[],
  automationTiers: [
    "operator_only",
    "file_timeline",
    "playbooks",
    "enterprise_audit_export",
  ] as const satisfies readonly AutomationVisibilityTier[],
  aiTiers: [
    "off",
    "suggestions_only",
    "draft_with_approval",
    "enterprise_governed",
  ] as const satisfies readonly AiWorkflowAssistanceTier[],
  analyticsMaturity: [
    "none",
    "usage_counters",
    "funnel_exports",
    "warehouse_sink_ready",
  ] as const satisfies readonly EnterpriseAnalyticsMaturity[],
  tenantScale: [
    "single_org",
    "org_sharding",
    "regional_cells",
    "cell_federation",
  ] as const satisfies readonly MultiTenantScaleTrack[],
} as const;
