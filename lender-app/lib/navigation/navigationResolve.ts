import type { NavCatalogEntry } from "./navigationCatalog";
import { isNavIconKey, NAV_CATALOG } from "./navigationCatalog";
import { navCatalogIdAllowed } from "./navPermissionMap";

export type NavigationPreset =
  | "admin"
  | "analyst"
  | "viewer"
  | "sales"
  | "processor"
  | "manager";

const NAV_PRESET_ORDER: readonly NavigationPreset[] = [
  "admin",
  "analyst",
  "viewer",
  "sales",
  "processor",
  "manager",
] as const;

export function isNavigationPreset(p: string): p is NavigationPreset {
  return (NAV_PRESET_ORDER as readonly string[]).includes(p);
}

/** Preset hides optional items for viewer; extend as RBAC / roles mature. */
const PRESET_HIDDEN: Record<NavigationPreset, Set<string>> = {
  admin: new Set(),
  analyst: new Set(),
  viewer: new Set(["documents", "analytics", "operations"]),
  sales: new Set(["documents"]),
  processor: new Set(),
  manager: new Set(),
};

export function navigationPresetHiddenIds(
  preset: NavigationPreset,
): ReadonlySet<string> {
  return PRESET_HIDDEN[preset] ?? new Set();
}

export type NavSyncScope = "cloud" | "device";
export type NavLayoutMode = "compact" | "expanded";

export type NavItemOverride = {
  id: string;
  visible?: boolean;
  /** Custom sort weight (lower first). When missing, uses catalog order. */
  order?: number;
  pinned?: boolean;
  /** Lucide mapping via `navIconForKey` allowlist only. */
  iconKey?: string;
};

export type NavQuickAction = {
  id: string;
  label: string;
  href: string;
  catalogId?: string;
  iconKey?: string;
  order?: number;
};

export function isSafeQuickActionHref(href: string): boolean {
  const t = href.trim();
  return t.startsWith("/") && !t.startsWith("//");
}

function normalizeQuickActions(
  raw: NavQuickAction[] | undefined,
): NavQuickAction[] {
  if (!raw?.length) return [];
  return raw
    .filter((q) => q.id && q.label && isSafeQuickActionHref(q.href))
    .map((q, i) => ({ ...q, order: q.order ?? (i + 1) * 10 }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export type ResolvedNavigationConfig = {
  formatVersion: number;
  preset: NavigationPreset;
  overrides: NavItemOverride[];
  quickActions?: NavQuickAction[];
  syncScope?: NavSyncScope;
  navLayoutMode?: NavLayoutMode;
};

export type OrgNavPolicy = {
  enforcedVisibleIds: ReadonlySet<string>;
  enforcedHiddenIds: ReadonlySet<string>;
};

export type NavResolveOptions = {
  /** When null/undefined, RBAC filtering is skipped (loading / tests). */
  grantedPermissions?: readonly string[] | null;
  orgPolicy?: OrgNavPolicy | null;
  recency?: ReadonlyMap<string, number> | null;
};

function mergeOverrideRecords(
  a: NavItemOverride | undefined,
  b: NavItemOverride,
): NavItemOverride {
  return { ...a, ...b };
}

function overrideMap(
  overrides: NavItemOverride[],
): Map<string, NavItemOverride> {
  const m = new Map<string, NavItemOverride>();
  for (const o of overrides) {
    m.set(o.id, mergeOverrideRecords(m.get(o.id), o));
  }
  return m;
}

export function defaultResolvedConfig(): ResolvedNavigationConfig {
  return {
    formatVersion: 2,
    preset: "admin",
    overrides: [],
    quickActions: [],
    syncScope: "cloud",
    navLayoutMode: "expanded",
  };
}

/**
 * Merge catalog with user overrides — visible items sorted for shell renderers.
 * Optional RBAC / org policy / recency adjust ordering.
 */
export function resolveVisibleNavItems(
  config: ResolvedNavigationConfig,
  options?: NavResolveOptions,
): NavCatalogEntry[] {
  const omap = overrideMap(config.overrides);
  const presetHide = PRESET_HIDDEN[config.preset] ?? new Set();
  const orgHidden = options?.orgPolicy?.enforcedHiddenIds ?? new Set();
  const orgVisible = options?.orgPolicy?.enforcedVisibleIds ?? new Set();
  const granted = options?.grantedPermissions;
  const recency = options?.recency ?? null;

  const rows: NavCatalogEntry[] = [];
  for (const entry of NAV_CATALOG) {
    const o = omap.get(entry.id);
    if (presetHide.has(entry.id)) continue;
    if (orgHidden.has(entry.id)) continue;
    if (granted && !navCatalogIdAllowed(entry.id, granted)) continue;

    const userHidden = o?.visible === false;
    const orgForcesVisible = orgVisible.has(entry.id);
    if (userHidden && !orgForcesVisible) continue;

    const icon =
      o?.iconKey && isNavIconKey(o.iconKey)
        ? { ...entry, iconKey: o.iconKey }
        : entry;
    rows.push(icon);
  }

  rows.sort((a, b) => {
    const oa = omap.get(a.id);
    const ob = omap.get(b.id);
    const pa = oa?.pinned ? 0 : 1;
    const pb = ob?.pinned ? 0 : 1;
    if (pa !== pb) return pa - pb;

    const ra = recency?.get(a.id) ?? 0;
    const rb = recency?.get(b.id) ?? 0;
    if (ra !== rb) return rb - ra;

    const orda = oa?.order ?? a.order;
    const ordb = ob?.order ?? b.order;
    if (orda !== ordb) return orda - ordb;
    return a.order - b.order;
  });

  return rows;
}

export function resolveQuickActions(
  config: ResolvedNavigationConfig,
  options?: NavResolveOptions,
): NavQuickAction[] {
  const list = normalizeQuickActions(config.quickActions);
  const orgHidden = options?.orgPolicy?.enforcedHiddenIds ?? new Set();
  const granted = options?.grantedPermissions;
  const out: NavQuickAction[] = [];
  for (const q of list) {
    if (q.catalogId && orgHidden.has(q.catalogId)) continue;
    if (q.catalogId && granted && !navCatalogIdAllowed(q.catalogId, granted))
      continue;
    if (q.iconKey && !isNavIconKey(q.iconKey)) {
      out.push({ ...q, iconKey: undefined });
      continue;
    }
    out.push(q);
  }
  return out;
}

export function catalogEntryById(id: string): NavCatalogEntry | undefined {
  return NAV_CATALOG.find((e) => e.id === id);
}

/** Convex / API row → app config (fills defaults). */
export function normalizeResolvedNavigationConfig(
  partial: Partial<ResolvedNavigationConfig> & {
    preset: NavigationPreset;
    overrides: NavItemOverride[];
  },
): ResolvedNavigationConfig {
  return {
    formatVersion: partial.formatVersion ?? 2,
    preset: partial.preset,
    overrides: partial.overrides,
    quickActions: partial.quickActions ?? [],
    syncScope: partial.syncScope ?? "cloud",
    navLayoutMode: partial.navLayoutMode ?? "expanded",
  };
}

/** Stable comparison after normalization — avoids setState loops when Convex returns new object identity. */
export function resolvedNavigationConfigEquals(
  a: ResolvedNavigationConfig,
  b: ResolvedNavigationConfig,
): boolean {
  const norm = (c: ResolvedNavigationConfig) => ({
    formatVersion: c.formatVersion,
    preset: c.preset,
    syncScope: c.syncScope ?? "cloud",
    navLayoutMode: c.navLayoutMode ?? "expanded",
    overrides: c.overrides,
    quickActions: c.quickActions ?? [],
  });
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
