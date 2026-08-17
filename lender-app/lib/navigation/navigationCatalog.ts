import { settingsHref } from "@/lib/settingsRegistry";

/**
 * Canonical app navigation catalog — single source of truth for routes and metadata.
 * @see components/navigation/* consumers
 */

export type NavIconKey =
  | "layoutGrid"
  | "home"
  | "activity"
  | "settings"
  | "users"
  | "wallet"
  | "barChart"
  | "fileText"
  | "panelTop"
  | "building"
  | "share"
  | "sparkles"
  | "zap";

/** Allowlist for overrides / settings UI — never dynamic-import icon strings. */
export const NAV_ICON_KEYS: readonly NavIconKey[] = [
  "layoutGrid",
  "home",
  "activity",
  "settings",
  "users",
  "wallet",
  "barChart",
  "fileText",
  "panelTop",
  "building",
  "share",
  "sparkles",
  "zap",
] as const;

const NAV_ICON_KEY_SET = new Set<string>(NAV_ICON_KEYS);

export function isNavIconKey(v: string): v is NavIconKey {
  return NAV_ICON_KEY_SET.has(v);
}

export type NavPriority = "high" | "medium" | "low";

export type NavCatalogEntry = {
  id: string;
  href: string;
  label: string;
  iconKey: NavIconKey;
  /** Logical section for grouping (sidebar / manager UI). */
  group: "workspace" | "pipeline" | "crm" | "system";
  priority: NavPriority;
  /** Stable order in default catalog (lower = earlier). */
  order: number;
  /** Shown on mobile bottom bar when space allows (max 4 primary slots). */
  mobilePrimary: boolean;
  /** Sub-routes under Pipeline group (analytics, ledger, etc.). */
  pipelineGroup?: boolean;
  productTourId?: string;
};

/** Pipeline zone: any of these paths highlight "pipeline" primary on mobile. */
export function isPipelineZonePath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/analytics" || pathname.startsWith("/analytics/")) return true;
  if (pathname === "/ledger" || pathname.startsWith("/ledger/")) return true;
  if (pathname === "/pipeline" || pathname.startsWith("/pipeline/")) return true;
  return false;
}

export const PIPELINE_SUB_ITEMS: Omit<
  NavCatalogEntry,
  "group" | "mobilePrimary" | "pipelineGroup"
>[] = [
  {
    id: "pipeline_hub",
    href: "/pipeline",
    label: "Pipeline view",
    iconKey: "layoutGrid",
    priority: "high",
    order: 10,
  },
  {
    id: "analytics",
    href: "/analytics",
    label: "Analytics",
    iconKey: "barChart",
    priority: "medium",
    order: 20,
  },
  {
    id: "ledger",
    href: "/ledger",
    label: "Ledger",
    iconKey: "wallet",
    priority: "medium",
    order: 30,
  },
  {
    id: "licenses",
    href: "/pipeline/licenses",
    label: "Licenses",
    iconKey: "panelTop",
    priority: "low",
    order: 50,
  },
];

export const NAV_CATALOG: NavCatalogEntry[] = [
  {
    id: "settings",
    href: settingsHref("appearance"),
    label: "Settings",
    iconKey: "settings",
    group: "system",
    priority: "medium",
    order: 5,
    mobilePrimary: true,
  },
  {
    id: "pipeline",
    href: "/pipeline",
    label: "Pipeline",
    iconKey: "home",
    group: "pipeline",
    priority: "high",
    order: 8,
    mobilePrimary: true,
    pipelineGroup: true,
    productTourId: "pipeline",
  },
  {
    id: "tasks",
    href: "/tasks",
    label: "Tasks",
    iconKey: "layoutGrid",
    group: "workspace",
    priority: "high",
    order: 10,
    mobilePrimary: true,
    productTourId: "tasks",
  },
  {
    id: "events",
    href: "/events",
    label: "Events",
    iconKey: "panelTop",
    group: "workspace",
    priority: "high",
    order: 15,
    mobilePrimary: false,
    productTourId: "events",
  },
  {
    id: "contacts",
    href: "/contacts",
    label: "Contacts",
    iconKey: "users",
    group: "crm",
    priority: "high",
    order: 20,
    mobilePrimary: false,
    productTourId: "contacts",
  },
  {
    id: "documents",
    href: "/documents",
    label: "Documents",
    iconKey: "fileText",
    group: "workspace",
    priority: "medium",
    order: 30,
    mobilePrimary: false,
  },
  {
    id: "operations",
    href: "/operations",
    label: "Operations",
    iconKey: "barChart",
    group: "workspace",
    priority: "high",
    order: 34,
    mobilePrimary: false,
  },
  {
    id: "shared",
    href: "/shared",
    label: "Shared",
    iconKey: "share",
    group: "workspace",
    priority: "high",
    order: 36,
    mobilePrimary: false,
  },
  {
    id: "activity",
    href: "/activity",
    label: "Activity",
    iconKey: "activity",
    group: "workspace",
    priority: "high",
    order: 40,
    mobilePrimary: true,
  },
  {
    id: "lenders",
    href: "/lenders",
    label: "Lenders",
    iconKey: "building",
    group: "crm",
    priority: "high",
    order: 60,
    mobilePrimary: false,
  },
  /**
   * Email / SMS / automation template hub — canonical UI for
   * `communicationTemplates` (not a second template store).
   * Directly under Lenders; mobile via overflow / hamburger (not bottom primary).
   */
  {
    id: "automations",
    href: "/automations",
    label: "Automations",
    iconKey: "zap",
    group: "crm",
    priority: "high",
    order: 65,
    mobilePrimary: false,
    productTourId: "automations",
  },
  /**
   * Secondary / WIP home — unfinished modules live here.
   * Not a mobile bottom-nav primary (crowded dock); visible in desktop
   * sidebar + mobile hamburger under Workspace tools.
   */
  {
    id: "coming-soon",
    href: "/coming-soon",
    label: "Coming soon",
    iconKey: "sparkles",
    group: "system",
    priority: "low",
    order: 70,
    mobilePrimary: false,
  },
];

export const NAV_CONFIG_FORMAT_VERSION = 1 as const;
