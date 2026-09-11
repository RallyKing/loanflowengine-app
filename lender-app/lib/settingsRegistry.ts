/**
 * Central registry for Settings hub sections — used for nav, deep links,
 * and contextual shortcuts across the app.
 *
 * IA (Jump-to groups): Personal · Workspace · Pipeline & workflow ·
 * Communications · Integrations · Team · Admin.
 *
 * Legacy hashes (`#appearance`, `#accessibility`, `#layout`) resolve to
 * the merged `display` section so existing deep links keep working.
 */
export const SETTINGS_PATH = "/settings";

/**
 * Canonical email / SMS / automation template hub (Automations nav).
 * Legacy `/settings/message-templates` redirects here — do not invent a second store.
 */
export const AUTOMATIONS_PATH = "/automations";

/** @deprecated Prefer `AUTOMATIONS_PATH` — alias kept for existing imports. */
export const MESSAGE_TEMPLATES_PATH = AUTOMATIONS_PATH;

/** Legacy Settings deep link; page permanently redirects to Automations. */
export const LEGACY_MESSAGE_TEMPLATES_PATH = "/settings/message-templates";

/** First-class org AI API keys + due diligence prompt library. */
export const AI_PROVIDERS_PATH = "/settings/ai-providers";

/**
 * Canonical hub sections (each has a scroll target on `/settings`, except
 * when a Jump-to item is a direct route — see `SETTINGS_JUMP_LINKS`).
 */
export const SETTINGS_SECTION_IDS = [
  "gettingStarted",
  "helpSupport",
  "display",
  "navigation",
  "workflow",
  "messageTemplates",
  "pipelineAdmin",
  "organization",
  "teamManagement",
  "billing",
  "domains",
  "notifications",
  "webhooks",
  "aiProviders",
  "data",
  "performance",
  "productKnowledge",
  "systemAdmin",
  /** @deprecated Prefer `display` — kept for typed deep links. */
  "appearance",
  /** @deprecated Prefer `display`. */
  "accessibility",
  /** @deprecated Prefer `display`. */
  "layout",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

/** Sub-tabs inside the merged Display & comfort section. */
export type SettingsDisplayTabId = "theme" | "accessibility" | "density";

/** Sub-tabs inside Pipeline & workflow. */
export type SettingsWorkflowTabId =
  | "defaults"
  | "templates"
  | "intelligence"
  | "stages";

const SECTION_SET = new Set<string>(SETTINGS_SECTION_IDS);

export function isSettingsSectionId(
  id: string | null | undefined,
): id is SettingsSectionId {
  return id != null && SECTION_SET.has(id);
}

/**
 * Legacy / convenience hashes → canonical section that owns the DOM id
 * `settings-section-{canonical}`.
 */
export const SETTINGS_SECTION_CANONICAL: Readonly<
  Partial<Record<SettingsSectionId, SettingsSectionId>>
> = {
  appearance: "display",
  accessibility: "display",
  layout: "display",
};

/** Which Display tab to open when arriving via a legacy hash. */
export const SETTINGS_DISPLAY_TAB_FROM_SECTION: Readonly<
  Partial<Record<SettingsSectionId, SettingsDisplayTabId>>
> = {
  appearance: "theme",
  display: "theme",
  accessibility: "accessibility",
  layout: "density",
};

export function resolveCanonicalSettingsSection(
  id: SettingsSectionId,
): SettingsSectionId {
  return SETTINGS_SECTION_CANONICAL[id] ?? id;
}

/**
 * Resolve a URL hash fragment to a typed section id (including legacy aliases).
 */
export function parseSettingsHashSection(
  raw: string | null | undefined,
): SettingsSectionId | null {
  if (!raw) return null;
  const id = raw.trim();
  return isSettingsSectionId(id) ? id : null;
}

export type SettingsSectionMeta = {
  id: SettingsSectionId;
  /** Primary nav label */
  label: string;
  /** Short label for tight toolbars */
  shortLabel: string;
  /** One line for sidebar / cards */
  description: string;
  /** Hidden from Jump-to (legacy alias only). */
  jumpHidden?: boolean;
  /**
   * When set, Jump-to navigates here instead of `#id` (dedicated sub-page).
   * The hub may still render a short card for in-page discoverability.
   */
  jumpHref?: string;
};

export const SETTINGS_SECTIONS: readonly SettingsSectionMeta[] = [
  {
    id: "gettingStarted",
    label: "Getting started",
    shortLabel: "Start",
    description:
      "Resume the setup checklist, product tour, and demo workspace tools.",
  },
  {
    id: "helpSupport",
    label: "Help & support",
    shortLabel: "Help",
    description:
      "Searchable help center, shortcuts, contextual tips, and contact support.",
  },
  {
    id: "display",
    label: "Display & comfort",
    shortLabel: "Display",
    description:
      "Theme, timezone, accent colors, motion, text size, and table density.",
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
    label: "Pipeline & workflow",
    shortLabel: "Workflow",
    description:
      "File defaults, personal templates, AI assist, and stage colors.",
  },
  {
    id: "messageTemplates",
    label: "Message templates",
    shortLabel: "Templates",
    description:
      "Email & SMS templates live under Automations (canonical communicationTemplates hub).",
    jumpHref: AUTOMATIONS_PATH,
  },
  {
    id: "pipelineAdmin",
    label: "Pipeline admin",
    shortLabel: "Pipeline",
    description:
      "Global drawer blocks, required sections, new-file defaults, and bulk sync.",
  },
  {
    id: "organization",
    label: "Organization",
    shortLabel: "Org",
    description: "Create a team, invite members, assign roles, and workspace policies.",
  },
  {
    id: "teamManagement",
    label: "Team management",
    shortLabel: "Access",
    description:
      "Create users, roles, passwords, session control, and directory administration.",
  },
  {
    id: "billing",
    label: "Team billing",
    shortLabel: "Billing",
    description: "Plan, checkout, invoices, and Stripe customer portal.",
  },
  {
    id: "domains",
    label: "Custom domains",
    shortLabel: "Domains",
    description: "Connect white-label hostnames that map to your organization.",
  },
  {
    id: "notifications",
    label: "Notifications",
    shortLabel: "Alerts",
    description: "In-app alerts, optional email, and @mention / deadline behavior.",
  },
  {
    id: "webhooks",
    label: "Webhooks",
    shortLabel: "Webhooks",
    description:
      "Register HTTPS endpoints for SaaS event routing (test ping, links, intake).",
  },
  {
    id: "aiProviders",
    label: "AI API keys",
    shortLabel: "AI keys",
    description:
      "Connect your own OpenAI, Anthropic, Gemini, or custom AI provider for due diligence and future features.",
    jumpHref: AI_PROVIDERS_PATH,
  },
  {
    id: "data",
    label: "Data & connectivity",
    shortLabel: "Data",
    description: "Live status indicator, storage notes, and migration checks.",
  },
  {
    id: "performance",
    label: "This device",
    shortLabel: "Device",
    description: "Local preference snapshot and reset to defaults.",
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
    description: "GodMode tenant switching (global administrators only).",
  },
  {
    id: "appearance",
    label: "Appearance",
    shortLabel: "Look",
    description: "Legacy link — opens Display & comfort → Theme.",
    jumpHidden: true,
  },
  {
    id: "accessibility",
    label: "Accessibility",
    shortLabel: "A11y",
    description: "Legacy link — opens Display & comfort → Accessibility.",
    jumpHidden: true,
  },
  {
    id: "layout",
    label: "Layout & density",
    shortLabel: "Layout",
    description: "Legacy link — opens Display & comfort → Density.",
    jumpHidden: true,
  },
] as const;

/** Deep link into Settings, e.g. `/settings#workflow` */
export function settingsHref(section?: SettingsSectionId): string {
  if (!section) return SETTINGS_PATH;
  return `${SETTINGS_PATH}#${section}`;
}

/**
 * Enterprise console categories — Jump-to groups (canonical IA).
 */
export const SETTINGS_CATEGORY_IDS = [
  "personal",
  "workspace",
  "pipelineWorkflow",
  "communications",
  "integrations",
  "team",
  "admin",
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
    id: "personal",
    label: "Personal",
    description: "How the app looks and feels on this account and device.",
    sectionIds: ["display", "performance"],
  },
  {
    id: "workspace",
    label: "Workspace",
    description: "Onboarding, help, navigation chrome, and white-label domains.",
    sectionIds: ["gettingStarted", "helpSupport", "navigation", "domains"],
  },
  {
    id: "pipelineWorkflow",
    label: "Pipeline & workflow",
    description: "Defaults, templates, stage styles, and global drawer policy.",
    sectionIds: ["workflow", "pipelineAdmin"],
  },
  {
    id: "communications",
    label: "Communications",
    description:
      "Thin Settings link to Automations (message templates) plus notification preferences.",
    sectionIds: ["messageTemplates", "notifications"],
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Webhooks, AI providers, live connectivity, and data health tools.",
    sectionIds: ["webhooks", "aiProviders", "data"],
  },
  {
    id: "team",
    label: "Team",
    description: "Organization membership, directory, and billing.",
    sectionIds: ["organization", "teamManagement", "billing"],
  },
  {
    id: "admin",
    label: "Admin",
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

// Legacy sections inherit the Personal / Display category for breadcrumbs.
for (const legacy of ["appearance", "accessibility", "layout"] as const) {
  const personal = SETTINGS_CATEGORIES.find((c) => c.id === "personal");
  if (personal) SECTION_TO_CATEGORY.set(legacy, personal);
}

export function settingsCategoryForSection(
  sectionId: SettingsSectionId,
): SettingsCategoryMeta | null {
  const canonical = resolveCanonicalSettingsSection(sectionId);
  return SECTION_TO_CATEGORY.get(canonical) ?? SECTION_TO_CATEGORY.get(sectionId) ?? null;
}

export function settingsSectionMeta(
  sectionId: SettingsSectionId,
): SettingsSectionMeta | null {
  return SETTINGS_SECTIONS.find((s) => s.id === sectionId) ?? null;
}

/** Old anchor → new home (for docs / agent reports). */
export const SETTINGS_ANCHOR_MIGRATION: Readonly<
  Record<string, { canonical: SettingsSectionId; note: string }>
> = {
  appearance: {
    canonical: "display",
    note: "Merged into Display & comfort → Theme tab",
  },
  accessibility: {
    canonical: "display",
    note: "Merged into Display & comfort → Accessibility tab",
  },
  layout: {
    canonical: "display",
    note: "Merged into Display & comfort → Density tab",
  },
  workflow: {
    canonical: "workflow",
    note: "Still Workflow; message templates moved to Communications",
  },
  messageTemplates: {
    canonical: "messageTemplates",
    note: "Owned by Automations (`/automations`); Settings is a thin link. Legacy `/settings/message-templates` redirects.",
  },
  aiProviders: {
    canonical: "aiProviders",
    note: "First-class Integrations item + /settings/ai-providers",
  },
};
