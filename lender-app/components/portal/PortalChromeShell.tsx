"use client";

/**
 * Partner-style portal chrome: sidebar + top header wrapping a grid content area.
 * Used by builder preview and live client/lender portals when a default is assigned.
 */

import type { ReactNode } from "react";
import {
  Bell,
  BookOpen,
  Briefcase,
  DollarSign,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  Plus,
  PlusCircle,
  Search,
  Settings,
  Sparkles,
  User,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  PORTAL_NAV_ICON_LABELS,
  PORTAL_NAV_ROUTE_LABELS,
  type PortalChromeConfig,
  type PortalNavIconKey,
  type PortalNavItem,
  type PortalNavRouteKey,
} from "@/lib/portalChrome";
import { portalPreviewRouteLabel } from "@/lib/portalPreviewRoutes";

const ICON_MAP: Record<PortalNavIconKey, LucideIcon> = {
  layoutDashboard: LayoutDashboard,
  fileText: FileText,
  messageSquare: MessageSquare,
  briefcase: Briefcase,
  dollarSign: DollarSign,
  bookOpen: BookOpen,
  workflow: Workflow,
  plusCircle: PlusCircle,
  megaphone: Megaphone,
  users: Users,
  sparkles: Sparkles,
  settings: Settings,
  user: User,
  bell: Bell,
  search: Search,
  home: Home,
};

function NavIcon({ iconKey, className }: { iconKey: PortalNavIconKey; className?: string }) {
  const Icon = ICON_MAP[iconKey] ?? LayoutDashboard;
  return <Icon className={className} aria-hidden />;
}

function SidebarNav({
  items,
  activeRouteKey,
  onSelect,
  interactive,
}: {
  items: PortalNavItem[];
  activeRouteKey?: string;
  onSelect?: (item: PortalNavItem) => void;
  interactive?: boolean;
}) {
  const enabled = items.filter((i) => i.enabled !== false);
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2" aria-label="Portal navigation">
      {enabled.map((item) => {
        const active = item.routeKey === (activeRouteKey ?? "dashboard");
        return (
          <button
            key={item.id}
            type="button"
            disabled={!interactive}
            onClick={() => {
              if (!interactive) return;
              onSelect?.(item);
            }}
            className={cn(
              "flex min-h-10 w-full items-center gap-2.5 rounded-dlc-md px-2.5 text-left text-sm font-medium transition-colors duration-dlc-short ease-dlc-standard",
              active
                ? "bg-primary/10 text-primary"
                : "text-foreground/80 hover:bg-muted",
              !interactive && "cursor-default",
              interactive && "cursor-pointer",
            )}
            aria-current={active ? "page" : undefined}
            data-testid={`portal-chrome-nav-${item.routeKey}`}
          >
            <NavIcon iconKey={item.iconKey} className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge ? (
              <span className="rounded-dlc-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export function PortalChromeShell({
  chrome,
  workspaceName,
  welcomeMessage,
  preview = false,
  interactive = false,
  activeRouteKey = "dashboard",
  onNavigate,
  children,
  className,
  contentClassName,
}: {
  chrome: PortalChromeConfig | null | undefined;
  workspaceName?: string;
  welcomeMessage?: string;
  /** Visual preview frame (bounded height / sample chrome). */
  preview?: boolean;
  /** When true, sidebar / tabs / profile navigate via onNavigate. */
  interactive?: boolean;
  activeRouteKey?: PortalNavRouteKey | string;
  onNavigate?: (routeKey: PortalNavRouteKey, item?: PortalNavItem) => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const sidebar = chrome?.sidebar;
  const top = chrome?.top;
  const layout = chrome?.layout;
  const brand =
    sidebar?.brandLabel?.trim() || workspaceName?.trim() || "Portal";
  const columns = layout?.contentColumns === 6 ? 6 : 12;
  const canInteract = interactive;
  const crumbLabel = portalPreviewRouteLabel(activeRouteKey);

  const handleSelect = (item: PortalNavItem) => {
    onNavigate?.(item.routeKey, item);
  };

  const goRoute = (routeKey: PortalNavRouteKey) => {
    onNavigate?.(routeKey);
  };

  return (
    <div
      className={cn(
        "flex w-full flex-col rounded-dlc-lg border border-border bg-dlc-surface shadow-dlc-1 md:flex-row",
        preview ? "min-h-0 overflow-hidden" : "min-h-0",
        className,
      )}
      data-testid="portal-chrome-shell"
      data-portal-columns={columns}
      data-portal-interactive={canInteract ? "true" : "false"}
      data-portal-active-route={activeRouteKey}
    >
      {/* Sidebar */}
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col border-b border-border bg-white md:w-56 md:border-b-0 md:border-r",
          preview && "md:max-h-[min(70vh,720px)]",
        )}
        data-testid="portal-chrome-sidebar"
      >
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-3">
          <div className="grid h-9 w-9 place-items-center rounded-dlc-md bg-primary text-xs font-bold text-primary-foreground">
            {(brand.slice(0, 2) || "P").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{brand}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {workspaceName ?? "Organization"}
            </p>
          </div>
        </div>
        <SidebarNav
          items={sidebar?.items ?? []}
          activeRouteKey={activeRouteKey}
          onSelect={handleSelect}
          interactive={canInteract}
        />
        {(sidebar?.showProfile !== false || sidebar?.showLogout !== false) && (
          <div className="mt-auto border-t border-border/70 p-2">
            {sidebar?.showProfile !== false ? (
              <button
                type="button"
                disabled={!canInteract}
                onClick={() => {
                  if (!canInteract) return;
                  goRoute("profile");
                }}
                className={cn(
                  "mb-1 flex min-h-10 w-full items-center gap-2 rounded-dlc-md px-2.5 text-sm text-foreground",
                  canInteract && "hover:bg-muted",
                  activeRouteKey === "profile" && "bg-primary/10 text-primary",
                  !canInteract && "cursor-default",
                )}
                data-testid="portal-chrome-nav-profile"
              >
                <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">Profile</span>
              </button>
            ) : null}
            {sidebar?.showLogout !== false ? (
              <button
                type="button"
                disabled={!canInteract}
                onClick={() => {
                  if (!canInteract) return;
                  goRoute("dashboard");
                }}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-dlc-md px-2.5 text-sm text-muted-foreground",
                  canInteract && "hover:bg-muted",
                )}
                title={
                  canInteract
                    ? "Preview: returns to dashboard (sign-out is live-only)"
                    : undefined
                }
                data-testid="portal-chrome-sign-out"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                Sign out
              </button>
            ) : null}
          </div>
        )}
      </aside>

      {/* Main column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-neutral-50">
        {top ? (
          <header
            className="shrink-0 border-b border-border bg-white px-3 py-2 sm:px-4"
            data-testid="portal-chrome-top"
          >
            <div className="flex flex-wrap items-center gap-2">
              {top.showBreadcrumbs !== false ? (
                <p className="text-xs text-muted-foreground">
                  Home › {crumbLabel}
                </p>
              ) : null}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {top.showSearch !== false ? (
                  <div className="relative hidden min-w-[12rem] sm:block sm:min-w-[16rem]">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <input
                      type="search"
                      readOnly={!canInteract}
                      placeholder="Search…"
                      className="h-9 w-full rounded-dlc-md border border-border bg-background pl-8 pr-3 text-sm"
                      aria-label="Search"
                      onFocus={() => {
                        if (canInteract) goRoute("ask_ai");
                      }}
                    />
                  </div>
                ) : null}
                {top.showNotifications !== false ? (
                  <button
                    type="button"
                    disabled={!canInteract}
                    onClick={() => {
                      if (!canInteract) return;
                      goRoute("documents");
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-dlc-md border border-border text-muted-foreground hover:bg-muted disabled:cursor-default"
                    aria-label="Notifications"
                    data-testid="portal-chrome-notifications"
                  >
                    <Bell className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!canInteract}
                  onClick={() => {
                    if (!canInteract) return;
                    goRoute("profile");
                  }}
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary",
                    canInteract && "hover:ring-2 hover:ring-primary/30",
                    !canInteract && "cursor-default",
                  )}
                  aria-label="Open profile"
                  data-testid="portal-chrome-avatar"
                >
                  U
                </button>
              </div>
            </div>
            {top.showWelcome !== false &&
            (activeRouteKey === "dashboard" || !activeRouteKey) ? (
              <div className="mt-2">
                <h1 className="text-base font-semibold text-foreground sm:text-lg">
                  Welcome{workspaceName ? ` to ${workspaceName}` : ""}
                </h1>
                {welcomeMessage?.trim() ? (
                  <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                    {welcomeMessage.trim()}
                  </p>
                ) : null}
              </div>
            ) : null}
            {(top.tabs?.length ?? 0) > 0 ? (
              <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
                {(top.tabs ?? [])
                  .filter((t) => t.enabled !== false)
                  .map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      disabled={!canInteract}
                      onClick={() => {
                        if (!canInteract) return;
                        handleSelect(tab);
                      }}
                      className={cn(
                        "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-dlc-md px-3 text-xs font-medium",
                        tab.routeKey === activeRouteKey
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted",
                        !canInteract && "cursor-default",
                      )}
                      title={PORTAL_NAV_ICON_LABELS[tab.iconKey]}
                      data-testid={`portal-chrome-tab-${tab.routeKey}`}
                    >
                      <NavIcon iconKey={tab.iconKey} className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  ))}
              </div>
            ) : null}
          </header>
        ) : null}

        <div
          className={cn(
            "relative min-h-0 flex-1 p-3 sm:p-4",
            /* Bounded nested scroll inside preview frame — settings <main> stays route owner. */
            preview ? "max-h-[min(70vh,720px)] overflow-y-auto overscroll-contain touch-scroll-y" : "",
            contentClassName,
          )}
          data-testid="portal-chrome-content"
        >
          {children}
          {layout?.showFab ? (
            <button
              type="button"
              disabled={!canInteract}
              onClick={() => {
                if (!canInteract) return;
                goRoute("submit");
              }}
              className="absolute bottom-4 right-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-dlc-3 disabled:cursor-default"
              aria-label={
                canInteract
                  ? `Quick action: ${PORTAL_NAV_ROUTE_LABELS.submit}`
                  : "Quick action"
              }
              data-testid="portal-chrome-fab"
            >
              <Plus className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Tailwind col-span helpers for a 12-col grid. */
export function portalColSpanClass(colSpan: number | undefined): string {
  switch (colSpan) {
    case 3:
      return "col-span-12 sm:col-span-6 lg:col-span-3";
    case 4:
      return "col-span-12 sm:col-span-6 lg:col-span-4";
    case 6:
      return "col-span-12 lg:col-span-6";
    case 8:
      return "col-span-12 lg:col-span-8";
    case 12:
    default:
      return "col-span-12";
  }
}
