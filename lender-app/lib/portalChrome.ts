/**
 * Portal chrome (sidebar + top header) for portal defaults page compositions.
 * Stored on `portalDefaultVersions.chrome` and promoted onto `portalDefaults.config.chrome`.
 */

import type { PortalDefaultType } from "@/lib/portalDefaults";

export const PORTAL_NAV_ROUTE_KEYS = [
  "dashboard",
  "documents",
  "messages",
  "deals",
  "commissions",
  "resources",
  "pipeline",
  "submit",
  "leads",
  "community",
  "ask_ai",
  "settings",
  "profile",
] as const;

export type PortalNavRouteKey = (typeof PORTAL_NAV_ROUTE_KEYS)[number];

export const PORTAL_NAV_ICON_KEYS = [
  "layoutDashboard",
  "fileText",
  "messageSquare",
  "briefcase",
  "dollarSign",
  "bookOpen",
  "workflow",
  "plusCircle",
  "megaphone",
  "users",
  "sparkles",
  "settings",
  "user",
  "bell",
  "search",
  "home",
] as const;

export type PortalNavIconKey = (typeof PORTAL_NAV_ICON_KEYS)[number];

export type PortalNavItem = {
  id: string;
  label: string;
  iconKey: PortalNavIconKey;
  routeKey: PortalNavRouteKey;
  badge?: string;
  order: number;
  enabled?: boolean;
};

export type PortalChromeConfig = {
  sidebar?: {
    brandLabel?: string;
    showProfile?: boolean;
    showLogout?: boolean;
    items: PortalNavItem[];
  };
  top?: {
    showWelcome?: boolean;
    showBreadcrumbs?: boolean;
    showSearch?: boolean;
    showNotifications?: boolean;
    tabs?: PortalNavItem[];
  };
  layout?: {
    /** CSS grid column count for the main content area (desktop). */
    contentColumns?: 6 | 12;
    showFab?: boolean;
  };
};

export const PORTAL_NAV_ROUTE_LABELS: Record<PortalNavRouteKey, string> = {
  dashboard: "Dashboard",
  documents: "Documents",
  messages: "Messages",
  deals: "My Deals",
  commissions: "Commissions",
  resources: "Resources",
  pipeline: "Pipeline",
  submit: "Submit a Deal",
  leads: "Lead Channels",
  community: "Community",
  ask_ai: "Ask AI",
  settings: "Settings",
  profile: "Profile",
};

export const PORTAL_NAV_ICON_LABELS: Record<PortalNavIconKey, string> = {
  layoutDashboard: "Dashboard",
  fileText: "Documents",
  messageSquare: "Messages",
  briefcase: "Deals",
  dollarSign: "Commissions",
  bookOpen: "Resources",
  workflow: "Pipeline",
  plusCircle: "Submit",
  megaphone: "Leads",
  users: "Community",
  sparkles: "Ask AI",
  settings: "Settings",
  user: "Profile",
  bell: "Notifications",
  search: "Search",
  home: "Home",
};

function newNavId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `nav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isRouteKey(raw: unknown): raw is PortalNavRouteKey {
  return (
    typeof raw === "string" &&
    (PORTAL_NAV_ROUTE_KEYS as readonly string[]).includes(raw)
  );
}

function isIconKey(raw: unknown): raw is PortalNavIconKey {
  return (
    typeof raw === "string" &&
    (PORTAL_NAV_ICON_KEYS as readonly string[]).includes(raw)
  );
}

export function sanitizePortalNavItems(
  raw: unknown,
  max = 16,
): PortalNavItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PortalNavItem[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, max)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!isRouteKey(row.routeKey) || !isIconKey(row.iconKey)) continue;
    const label =
      typeof row.label === "string" ? row.label.trim().slice(0, 48) : "";
    if (!label) continue;
    let id =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim().slice(0, 64)
        : newNavId();
    if (seen.has(id)) id = newNavId();
    seen.add(id);
    const order =
      typeof row.order === "number" && Number.isFinite(row.order)
        ? Math.max(0, Math.min(999, Math.floor(row.order)))
        : out.length;
    const badge =
      typeof row.badge === "string" ? row.badge.trim().slice(0, 24) : undefined;
    out.push({
      id,
      label,
      iconKey: row.iconKey,
      routeKey: row.routeKey,
      order,
      enabled: row.enabled === false ? false : true,
      ...(badge ? { badge } : {}),
    });
  }
  return out.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function sanitizePortalChrome(
  portalType: PortalDefaultType,
  raw: unknown,
): PortalChromeConfig {
  const base = defaultPortalChrome(portalType);
  if (!raw || typeof raw !== "object") return base;
  const c = raw as Record<string, unknown>;
  const sidebarRaw =
    c.sidebar && typeof c.sidebar === "object"
      ? (c.sidebar as Record<string, unknown>)
      : null;
  const topRaw =
    c.top && typeof c.top === "object"
      ? (c.top as Record<string, unknown>)
      : null;
  const layoutRaw =
    c.layout && typeof c.layout === "object"
      ? (c.layout as Record<string, unknown>)
      : null;

  const sidebarItems = sanitizePortalNavItems(sidebarRaw?.items);
  const topTabs = sanitizePortalNavItems(topRaw?.tabs, 8);

  return {
    sidebar: {
      brandLabel:
        typeof sidebarRaw?.brandLabel === "string"
          ? sidebarRaw.brandLabel.trim().slice(0, 80)
          : base.sidebar?.brandLabel,
      showProfile:
        sidebarRaw?.showProfile === false
          ? false
          : (base.sidebar?.showProfile ?? true),
      showLogout:
        sidebarRaw?.showLogout === false
          ? false
          : (base.sidebar?.showLogout ?? true),
      items: sidebarItems.length > 0 ? sidebarItems : (base.sidebar?.items ?? []),
    },
    top: {
      showWelcome:
        topRaw?.showWelcome === false
          ? false
          : (base.top?.showWelcome ?? true),
      showBreadcrumbs:
        topRaw?.showBreadcrumbs === false
          ? false
          : (base.top?.showBreadcrumbs ?? true),
      showSearch:
        topRaw?.showSearch === false ? false : (base.top?.showSearch ?? true),
      showNotifications:
        topRaw?.showNotifications === false
          ? false
          : (base.top?.showNotifications ?? true),
      tabs: topTabs.length > 0 ? topTabs : (base.top?.tabs ?? []),
    },
    layout: {
      contentColumns:
        layoutRaw?.contentColumns === 6 || layoutRaw?.contentColumns === 12
          ? layoutRaw.contentColumns
          : (base.layout?.contentColumns ?? 12),
      showFab:
        layoutRaw?.showFab === false ? false : (base.layout?.showFab ?? true),
    },
  };
}

function nav(
  label: string,
  iconKey: PortalNavIconKey,
  routeKey: PortalNavRouteKey,
  order: number,
  badge?: string,
): PortalNavItem {
  return {
    id: newNavId(),
    label,
    iconKey,
    routeKey,
    order,
    enabled: true,
    ...(badge ? { badge } : {}),
  };
}

/** Soft-start chrome per portal role (partner-portal style). */
export function defaultPortalChrome(
  portalType: PortalDefaultType,
): PortalChromeConfig {
  switch (portalType) {
    case "client":
      return {
        sidebar: {
          brandLabel: "Client portal",
          showProfile: true,
          showLogout: true,
          items: [
            nav("Dashboard", "layoutDashboard", "dashboard", 0),
            nav("Documents", "fileText", "documents", 1),
            nav("Messages", "messageSquare", "messages", 2),
            nav("Resources", "bookOpen", "resources", 3),
          ],
        },
        top: {
          showWelcome: true,
          showBreadcrumbs: true,
          showSearch: true,
          showNotifications: true,
          tabs: [
            nav("Overview", "home", "dashboard", 0),
            nav("Documents", "fileText", "documents", 1),
          ],
        },
        layout: { contentColumns: 12, showFab: false },
      };
    case "lender":
      return {
        sidebar: {
          brandLabel: "Lender delivery",
          showProfile: true,
          showLogout: true,
          items: [
            nav("Dashboard", "layoutDashboard", "dashboard", 0),
            nav("Package", "fileText", "documents", 1),
            nav("Deal summary", "briefcase", "deals", 2),
            nav("Resources", "bookOpen", "resources", 3),
          ],
        },
        top: {
          showWelcome: true,
          showBreadcrumbs: true,
          showSearch: true,
          showNotifications: false,
          tabs: [],
        },
        layout: { contentColumns: 12, showFab: false },
      };
    case "referrer":
      return {
        sidebar: {
          brandLabel: "Partner portal",
          showProfile: true,
          showLogout: true,
          items: [
            nav("Dashboard", "layoutDashboard", "dashboard", 0),
            nav("My Deals", "briefcase", "deals", 1),
            nav("Submit a Deal", "plusCircle", "submit", 2),
            nav("Lead Channels", "megaphone", "leads", 3),
            nav("Messages", "messageSquare", "messages", 4),
            nav("Commissions", "dollarSign", "commissions", 5),
            nav("Resources", "bookOpen", "resources", 6),
            nav("Ask AI", "sparkles", "ask_ai", 7),
          ],
        },
        top: {
          showWelcome: true,
          showBreadcrumbs: true,
          showSearch: true,
          showNotifications: true,
          tabs: [
            nav("Dashboard", "layoutDashboard", "dashboard", 0),
            nav("Pipeline", "workflow", "pipeline", 1),
          ],
        },
        layout: { contentColumns: 12, showFab: true },
      };
    case "deal_partner":
      return {
        sidebar: {
          brandLabel: "Deal partner",
          showProfile: true,
          showLogout: true,
          items: [
            nav("Dashboard", "layoutDashboard", "dashboard", 0),
            nav("My Deals", "briefcase", "deals", 1),
            nav("Pipeline", "workflow", "pipeline", 2),
            nav("Messages", "messageSquare", "messages", 3),
            nav("Commissions", "dollarSign", "commissions", 4),
            nav("Resources", "bookOpen", "resources", 5),
            nav("Community", "users", "community", 6),
          ],
        },
        top: {
          showWelcome: true,
          showBreadcrumbs: true,
          showSearch: true,
          showNotifications: true,
          tabs: [
            nav("Overview", "home", "dashboard", 0),
            nav("Activity", "workflow", "pipeline", 1),
          ],
        },
        layout: { contentColumns: 12, showFab: true },
      };
  }
}

export function makePortalNavItem(
  partial: Omit<PortalNavItem, "id" | "order" | "enabled"> & {
    order?: number;
    enabled?: boolean;
  },
): PortalNavItem {
  return {
    id: newNavId(),
    label: partial.label,
    iconKey: partial.iconKey,
    routeKey: partial.routeKey,
    order: partial.order ?? 0,
    enabled: partial.enabled ?? true,
    ...(partial.badge ? { badge: partial.badge } : {}),
  };
}
