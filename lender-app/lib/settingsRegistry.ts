/**
 * Central registry for Settings hub sections — used for nav, deep links,
 * and contextual shortcuts across the app.
 */
export const SETTINGS_PATH = "/settings";

export const SETTINGS_SECTION_IDS = [
  "gettingStarted",
  "helpSupport",
  "organization",
  "teamManagement",
  "billing",
  "domains",
  "appearance",
  "accessibility",
  "layout",
  "navigation",
  "workflow",
  "pipelineAdmin",
  "productKnowledge",
  "systemAdmin",
  "performance",
  "data",
  "notifications",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

const SECTION_SET = new Set<string>(SETTINGS_SECTION_IDS);

export function isSettingsSectionId(
  id: string | null | undefined
): id is SettingsSectionId {
  return id != null && SECTION_SET.has(id);
}

export type SettingsSectionMeta = {
  id: SettingsSectionId;
  /** Primary nav label */
  label: string;
  /** Short label for tight toolbars */
  shortLabel: string;
  /** One line for sidebar / cards */
  description: string;
};

export const SETTINGS_SECTIONS: readonly SettingsSectionMeta[] = [
  {
    id: "gettingStarted",
    label: "Getting started",
    shortLabel: "Start",
    description:
      "Resume or restart the optional setup checklist (team, first file, contact).",
  },
  {
    id: "helpSupport",
    label: "Help & support",
    shortLabel: "Help",
    description:
      "Searchable help center, shortcuts, contextual tips, and contact support.",
  },
  {
    id: "organization",
    label: "Organization",
    shortLabel: "Team",
    description: "Create a team, invite members, assign roles, and workspace policies.",
  },
  {
    id: "teamManagement",
    label: "Team management",
    shortLabel: "Access",
    description:
      "Create users, roles, passwords, session control, and Phase 12 directory administration.",
  },
  {
    id: "billing",
    label: "Team billing",
    shortLabel: "Billing",
    description: "Plan, checkout, invoices, and Stripe customer portal.",
  },
  {
    id: "domains",
    label: "Domains",
    shortLabel: "Domains",
    description: "Connect white-label hostnames that map to your organization.",
  },
  {
    id: "appearance",
    label: "Appearance",
    shortLabel: "Look",
    description: "Workspace theme and shell (Classic vs SaaS).",
  },
  {
    id: "accessibility",
    label: "Accessibility",
    shortLabel: "A11y",
    description: "Motion, text size, and keyboard focus visibility.",
  },
  {
    id: "layout",
    label: "Layout & density",
    shortLabel: "Layout",
    description: "Data grids and side drawers — how dense things feel.",
  },
  {
    id: "navigation",
    label: "Navigation",
    shortLabel: "Nav",
    description:
      "Reorder primary routes, show or hide destinations, and preview tablet layouts.",
  },
  {
    id: "workflow",
    label: "Workflow",
    shortLabel: "Workflow",
    description:
      "Pipeline defaults, intelligence, file sections on open, and intake auto-save.",
  },
  {
    id: "pipelineAdmin",
    label: "Pipeline admin",
    shortLabel: "Pipeline",
    description:
      "Global drawer blocks, required sections, new-file defaults, and bulk sync.",
  },
  {
    id: "productKnowledge",
    label: "Product knowledge",
    shortLabel: "Knowledge",
    description:
      "Publish release notes and seed the feature encyclopedia (global administrators).",
  },
  {
    id: "systemAdmin",
    label: "System admin",
    shortLabel: "System",
    description:
      "GodMode tenant switching (global administrators only).",
  },
  {
    id: "performance",
    label: "Performance",
    shortLabel: "Speed",
    description: "This device, resets, and a quick health summary.",
  },
  {
    id: "data",
    label: "Data & connectivity",
    shortLabel: "Data",
    description: "Live status indicator and how data stays on this device.",
  },
  {
    id: "notifications",
    label: "Notifications",
    shortLabel: "Alerts",
    description: "In-app alerts, optional email, and @mention / deadline behavior.",
  },
] as const;

/** Deep link into Settings, e.g. `/settings#workflow` */
export function settingsHref(section?: SettingsSectionId): string {
  if (!section) return SETTINGS_PATH;
  return `${SETTINGS_PATH}#${section}`;
}

/**
 * Enterprise console categories — groups the flat section list into
 * distinct administrative modules (nav grouping + breadcrumb trails).
 */
export const SETTINGS_CATEGORY_IDS = [
  "workspaceBranding",
  "loanStrategy",
  "teamPermissions",
  "integrationsPortals",
  "systemAdministration",
] as const;

export type SettingsCategoryId = (typeof SETTINGS_CATEGORY_IDS)[number];

export type SettingsCategoryMeta = {
  id: SettingsCategoryId;
  label: string;
  description: string;
  /** Sections rendered under this category, in display order. */
  sectionIds: readonly SettingsSectionId[];
  /** Visible to global administrators only. */
  adminOnly?: boolean;
};

export const SETTINGS_CATEGORIES: readonly SettingsCategoryMeta[] = [
  {
    id: "workspaceBranding",
    label: "Workspace & branding",
    description:
      "Appearance, accessibility, layout density, navigation, white-label domains, and onboarding.",
    sectionIds: [
      "gettingStarted",
      "helpSupport",
      "appearance",
      "accessibility",
      "layout",
      "navigation",
      "domains",
    ],
  },
  {
    id: "loanStrategy",
    label: "Loan strategy & pipeline",
    description:
      "Loan strategy templates, pipeline defaults, drawer block policy, and stage administration.",
    sectionIds: ["workflow", "pipelineAdmin"],
  },
  {
    id: "teamPermissions",
    label: "Team & permissions",
    description:
      "Organization membership, roles, directory administration, and billing.",
    sectionIds: ["organization", "teamManagement", "billing"],
  },
  {
    id: "integrationsPortals",
    label: "Integrations & portals",
    description:
      "Notifications, connectivity, data behavior, and device performance.",
    sectionIds: ["notifications", "data", "performance"],
  },
  {
    id: "systemAdministration",
    label: "System administration",
    description:
      "Global administrator tooling: product knowledge and tenant switching.",
    sectionIds: ["productKnowledge", "systemAdmin"],
    adminOnly: true,
  },
] as const;

const SECTION_TO_CATEGORY = new Map<SettingsSectionId, SettingsCategoryMeta>(
  SETTINGS_CATEGORIES.flatMap((category) =>
    category.sectionIds.map((sectionId) => [sectionId, category] as const),
  ),
);

export function settingsCategoryForSection(
  sectionId: SettingsSectionId,
): SettingsCategoryMeta | null {
  return SECTION_TO_CATEGORY.get(sectionId) ?? null;
}

export function settingsSectionMeta(
  sectionId: SettingsSectionId,
): SettingsSectionMeta | null {
  return SETTINGS_SECTIONS.find((s) => s.id === sectionId) ?? null;
}
