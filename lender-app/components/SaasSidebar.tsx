"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ChevronDown, Layers, PanelLeftClose, Settings, X } from "lucide-react";
import { ColorSchemeToggle } from "@/components/ColorSchemeToggle";
import { APP_HOME_HREF } from "@/lib/brandIdentity";
import { cn } from "@/lib/cn";
import { settingsHref } from "@/lib/settingsRegistry";
import { useOrgBranding } from "@/lib/orgBrandingContext";
import { useAuth } from "@/lib/sessionUiClient";
import { GlobalTenantSwitcher } from "@/components/system-admin/GlobalTenantSwitcher";

import {
  PIPELINE_SUB_ITEMS,
  isNavIconKey,
} from "@/lib/navigation/navigationCatalog";
import { shellZIndexStyle } from "@/lib/ui/layerTokens";
import { shellMotionTw } from "@/lib/ui/motionTokens";
import {
  isActivePath,
  isPipelineZonePath,
} from "@/lib/navigation/navPathUtils";
import { useNarrowViewport } from "@/lib/useNarrowViewport";
import { navIconForKey } from "@/lib/navigation/navIcons";
import { useNavigationConfigOptional } from "@/components/navigation/NavigationConfigProvider";
import {
  defaultResolvedConfig,
  resolveVisibleNavItems,
} from "@/lib/navigation/navigationResolve";
import { MOBILE_DRAWER_SAFE_TOP_PAD_CLASS } from "@/lib/ui/safeArea";

const PIPELINE_LINKS: { href: string; label: string; tourId?: string }[] =
  PIPELINE_SUB_ITEMS.map((s) => ({
    href: s.href,
    label: s.label,
    tourId: s.productTourId,
  }));

/**
 * Directory consolidation — secondary / administrative destinations collapse
 * into a "Workspace tools" sub-menu instead of cluttering the primary rail.
 * Includes Coming soon (WIP home) so unfinished tabs stay off the primary rail.
 */
const WORKSPACE_TOOLS_NAV_IDS = new Set([
  "operations",
  "shared",
  "activity",
  "coming-soon",
]);

function Section({
  title,
  links,
  pathname,
  groupActive,
  onLinkClick,
  dataTourSection,
  compact,
  defaultOpen = true,
}: {
  title: string;
  links: { href: string; label: string; tourId?: string }[];
  pathname: string | null;
  groupActive: (p: string | null) => boolean;
  onLinkClick?: () => void;
  /** `data-product-tour` on section root (product tour spotlight). */
  dataTourSection?: string;
  compact?: boolean;
  /** Collapsed by default for secondary/administrative groups. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const listId = useId();
  const path = usePathname();
  const g = groupActive(path);
  useEffect(() => {
    if (g) setOpen(true);
  }, [g, path]);

  return (
    <div
      className="border-b border-white/10 pb-3 last:border-0 last:pb-0"
      {...(dataTourSection
        ? { "data-product-tour": dataTourSection }
        : {})}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-white/88 hover:bg-white/5"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        {title}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-white/70 transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <ul id={listId} className="mt-1 space-y-0.5 pl-1" role="list">
          {links.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onLinkClick}
                  aria-current={active ? "page" : undefined}
                  {...(item.tourId ? { "data-product-tour": item.tourId } : {})}
                  className={cn(
                    "relative block rounded-md py-1.5 pl-3 pr-2 text-sm",
                    shellMotionTw.navLinkTone,
                    active
                      ? cn(
                          "bg-white/10 font-medium text-white before:absolute before:left-0 before:w-0.5 before:rounded-full before:bg-white",
                          compact ? "before:inset-y-1" : "before:inset-y-1.5",
                        )
                      : "text-white/88 hover:bg-white/8 hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function SaasSidebar({
  mobileOpen = true,
  desktopExpanded = true,
  motionReady = true,
  variant = "default",
  onNavLinkClick,
  onCloseMobile,
  onCollapseDesktop,
}: {
  mobileOpen?: boolean;
  desktopExpanded?: boolean;
  /** When false, skip desktop width transition (first paint / reduced CLS). */
  motionReady?: boolean;
  /**
   * `desktopEmbedded` — fill the animated rail shell (no own sticky/width/border).
   * `default` — standalone mobile drawer / legacy desktop column.
   */
  variant?: "default" | "desktopEmbedded";
  onNavLinkClick?: () => void;
  onCloseMobile?: () => void;
  onCollapseDesktop?: () => void;
} = {}) {
  const pathname = usePathname();
  const go = onNavLinkClick;
  const { headerTitle, logoUrl } = useOrgBranding();
  const { isGlobalAdmin } = useAuth();
  const navCtx = useNavigationConfigOptional();
  const resolved =
    navCtx?.resolvedItems ??
    resolveVisibleNavItems(navCtx?.config ?? defaultResolvedConfig());
  const quickActions = navCtx?.resolvedQuickActions ?? [];
  const navCompact = navCtx?.config.navLayoutMode === "compact";
  const narrow = useNarrowViewport();
  const embedded = variant === "desktopEmbedded";
  return (
    <aside
      className={cn(
        "flex flex-col bg-nav-sidebar text-nav-sidebar-foreground",
        embedded
          ? "h-full w-full min-w-0 border-0"
          : cn(
              "w-64 min-w-64 max-w-64 border-r border-white/5",
              "max-md:w-[min(22rem,88vw)] max-md:max-w-[90vw] max-md:min-w-0",
              /* Mobile: stretch with top/bottom only — do NOT set height/max-height
                 (those ignore bottom and leave a white body gap under 100dvh). */
              "md:sticky md:top-0 md:h-dvh md:max-h-dvh md:min-h-0 md:self-start md:shrink-0 md:translate-x-0 md:overflow-hidden",
              motionReady ? shellMotionTw.sidebarRailWidth : "md:transition-none",
              desktopExpanded
                ? "md:w-64 md:min-w-64 md:max-w-64 md:opacity-100"
                : "md:w-0 md:min-w-0 md:max-w-0 md:opacity-0 md:pointer-events-none md:border-transparent",
              /** Mobile drawer: fixed full-bleed into home-indicator zone. */
              "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:h-auto max-md:max-h-none max-md:min-h-0 max-md:overflow-hidden",
              shellMotionTw.drawerTranslate,
              mobileOpen
                ? "max-md:translate-x-0"
                : "max-md:-translate-x-full max-md:pointer-events-none",
            ),
      )}
      style={embedded ? undefined : shellZIndexStyle("modal")}
      data-saas-mobile-drawer={
        embedded ? undefined : mobileOpen ? "open" : "closed"
      }
      aria-label="Primary navigation"
      aria-hidden={
        embedded
          ? undefined
          : narrow
            ? !mobileOpen
              ? true
              : undefined
            : !desktopExpanded
              ? true
              : undefined
      }
    >
      <div
        className={cn(
          "relative flex min-h-14 shrink-0 items-center border-b border-white/10 px-3 py-2 md:px-4",
          !embedded && MOBILE_DRAWER_SAFE_TOP_PAD_CLASS,
        )}
      >
        {onCloseMobile ? (
          <button
            type="button"
            onClick={onCloseMobile}
            className="absolute right-1.5 top-1.5 inline-flex h-10 w-10 items-center justify-center rounded-md text-white/80 hover:bg-white/10 md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
        {onCollapseDesktop ? (
          <button
            type="button"
            onClick={onCollapseDesktop}
            className="absolute right-1.5 top-1.5 hidden h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 md:inline-flex"
            aria-label="Collapse navigation sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <Link
          href={APP_HOME_HREF}
          onClick={go}
          aria-label={`${headerTitle} home`}
          className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 pe-10 transition-opacity hover:opacity-95 md:pe-11"
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg border border-white/20 bg-white/10 object-contain shadow-sm"
              width={36}
              height={36}
            />
          ) : (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/20 bg-white/10 text-xs font-bold text-white shadow-sm">
              DLC
            </div>
          )}
          <div className="min-w-0 leading-tight">
            <div className="break-words text-sm font-semibold tracking-tight text-white">
              {headerTitle}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-white/70">
              Funding & pipeline
            </div>
          </div>
        </Link>
      </div>

      <nav className="min-h-0 min-w-0 flex-1 touch-scroll-y space-y-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-2 pt-2">
        {resolved.map((entry) => {
            if (entry.id === "settings") return null;
            if (WORKSPACE_TOOLS_NAV_IDS.has(entry.id)) return null;
            if (entry.pipelineGroup) {
              return (
                <Section
                  key={entry.id}
                  title={entry.label}
                  dataTourSection={entry.productTourId}
                  links={PIPELINE_LINKS}
                  pathname={pathname}
                  groupActive={isPipelineZonePath}
                  onLinkClick={go}
                  compact={navCompact}
                />
              );
            }
            const active = isActivePath(pathname, entry.href);
            return (
              <Link
                key={entry.id}
                href={entry.href}
                onClick={go}
                aria-current={active ? "page" : undefined}
                {...(entry.productTourId
                  ? { "data-product-tour": entry.productTourId }
                  : {})}
                className={cn(
                  "relative block rounded-md",
                  shellMotionTw.navLinkTone,
                  navCompact
                    ? "py-1 pl-2 pr-1.5 text-xs"
                    : "py-1.5 pl-3 pr-2 text-sm",
                  active
                    ? cn(
                        "bg-white/10 font-medium text-white before:absolute before:left-0 before:w-0.5 before:rounded-full before:bg-white",
                        navCompact ? "before:inset-y-1" : "before:inset-y-1.5",
                      )
                    : "text-white/88 hover:bg-white/8 hover:text-white",
                )}
              >
                {entry.label}
              </Link>
            );
          })}
        {(() => {
          const toolLinks = resolved
            .filter((entry) => WORKSPACE_TOOLS_NAV_IDS.has(entry.id))
            .map((entry) => ({
              href: entry.href,
              label: entry.label,
              tourId: entry.productTourId,
            }));
          if (toolLinks.length === 0) return null;
          const toolsActive = (p: string | null) =>
            toolLinks.some((l) => isActivePath(p, l.href));
          return (
            <Section
              title="Workspace tools"
              links={toolLinks}
              pathname={pathname}
              groupActive={toolsActive}
              onLinkClick={go}
              compact={navCompact}
              defaultOpen={toolsActive(pathname)}
            />
          );
        })()}
      </nav>

      {quickActions.length > 0 ? (
        <div className="shrink-0 space-y-1 border-t border-white/10 px-2 py-2">
          <p className="px-2 text-[10px] font-medium uppercase tracking-wider text-white/65">
            Quick actions
          </p>
          <ul className="space-y-0.5" role="list">
            {quickActions.map((q) => {
              const active = isActivePath(pathname, q.href);
              const Icon =
                q.iconKey && isNavIconKey(q.iconKey)
                  ? navIconForKey(q.iconKey)
                  : Settings;
              return (
                <li key={q.id}>
                  <Link
                    href={q.href}
                    onClick={go}
                    aria-label={q.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2 rounded-md pl-3 pr-2",
                      shellMotionTw.navLinkTone,
                      navCompact ? "py-1 text-xs" : "py-1.5 text-sm",
                      active
                        ? cn(
                            "bg-white/12 font-medium text-white before:absolute before:left-0 before:w-0.5 before:rounded-full before:bg-white",
                            navCompact ? "before:inset-y-1" : "before:inset-y-1.5",
                          )
                        : "text-white/88 hover:bg-white/8 hover:text-white",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                    <span className="truncate">{q.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {isGlobalAdmin ? (
        <div className="shrink-0 border-t border-white/10 px-2 py-2">
          <GlobalTenantSwitcher variant="sidebar" />
        </div>
      ) : null}

      <div className="mt-auto shrink-0 space-y-2 border-t border-white/10 bg-nav-sidebar p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <Link
          href={settingsHref("appearance")}
          onClick={go}
          aria-label="All settings"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-white/20 bg-white/5 py-2 text-sm font-medium text-white/95 transition-colors hover:bg-white/10"
        >
          <Settings className="h-4 w-4" aria-hidden />
          <span>All settings</span>
        </Link>
        <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-white/65">
          Quick theme
        </p>
        <ColorSchemeToggle className="w-full border-white/20 bg-white/5 text-white [&_select]:text-white" />
        <p className="px-1 text-[10px] text-white/62">
          <Layers className="mb-0.5 inline h-3 w-3" aria-hidden /> Green nav · blue
          actions
        </p>
      </div>
    </aside>
  );
}
