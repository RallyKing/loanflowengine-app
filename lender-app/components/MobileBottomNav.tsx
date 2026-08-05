"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useLayoutEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  mobileFocusBottomNavHidden,
  mobileFocusBottomNavVisible,
} from "@/lib/mobileCompactChrome";
import { useMobileBottomNavFocusMode } from "@/components/MobileChromeController";
import { navIconForKey } from "@/lib/navigation/navIcons";
import {
  isActivePath,
  isPipelineZonePath,
} from "@/lib/navigation/navPathUtils";
import { resolvePipelineSurfaceRoute } from "@/lib/navigation/isPipelineSurfaceRoute";
import {
  PHASE_24_4J_PIPELINE_NAV_LOCK,
  PIPELINE_BOTTOM_NAV_FORCE_VISIBLE_CLASS,
} from "@/lib/debug/phase24-4J-pipeline-nav-lock";
import {
  PHASE_24_4L_DOM_MOUNT_LOCK,
  PIPELINE_BOTTOM_NAV_DOM_LOCK_CLASS,
  PIPELINE_NAV_DOM_LOCK_HTML_ATTR,
} from "@/lib/debug/phase24-4L-dom-mount-lock";
import { useNavigationConfigOptional } from "@/components/navigation/NavigationConfigProvider";
import {
  defaultResolvedConfig,
  resolveVisibleNavItems,
} from "@/lib/navigation/navigationResolve";
import {
  MOBILE_BOTTOM_SLOT_IDS,
  pickMobileBottomItems,
} from "@/lib/navigation/mobileBottomSlots";
import { shellPanelZIndex, shellZIndexStyle } from "@/lib/ui/layerTokens";
import { shellMotionTw } from "@/lib/ui/motionTokens";
import type { NavCatalogEntry } from "@/lib/navigation/navigationCatalog";
import { useResponsiveNav } from "@/components/navigation/ResponsiveNavProvider";
import { useShellMotionReady } from "@/components/layout/ShellMotionReadyContext";
import { navFocusRingClass } from "@/lib/navigation/navFocusRing";
import type { ResponsiveNavLayout } from "@/lib/navigation/useResponsiveNavLayout";
import { bottomNavFixedBottom, safeAreaBottom } from "@/lib/ui/safeArea";

const MOBILE_BOTTOM_ID_SET = new Set(MOBILE_BOTTOM_SLOT_IDS);

const NAV_PX = "";
const NAV_SAFE_X =
  "pl-[max(0px,env(safe-area-inset-left))] pr-[max(0px,env(safe-area-inset-right))]";

function entryActive(pathname: string | null, e: NavCatalogEntry): boolean {
  if (e.pipelineGroup) return isPipelineZonePath(pathname);
  return isActivePath(pathname, e.href);
}

function bottomNavPlacementClass(
  layout: ResponsiveNavLayout,
  forceDomLock: boolean,
): string {
  if (forceDomLock) return "flex md:hidden";
  if (!layout.useBottomNavigation) return "hidden";
  if (layout.shell === "mobile") return "flex md:hidden";
  if (layout.shell === "tablet") return "hidden md:flex xl:hidden";
  return "hidden";
}

function bottomNavOverlayClass(
  layout: ResponsiveNavLayout,
  forceDomLock: boolean,
): string {
  if (forceDomLock) return "md:hidden";
  if (!layout.useBottomNavigation) return "hidden";
  if (layout.shell === "mobile") return "md:hidden";
  if (layout.shell === "tablet") return "hidden md:block xl:hidden";
  return "hidden";
}

/**
 * Phase 24.4L — always mounted; pipeline routes never hide via focus/CSS/display:none.
 * SaaS mobile drawer may force-hide so the white dock cannot paint over the menu scrim.
 */
export const MobileBottomNav = memo(function MobileBottomNav({
  forceHidden = false,
}: {
  /** When true (e.g. SaaS hamburger drawer open), fully hide the dock on phone. */
  forceHidden?: boolean;
} = {}) {
  const pathname = usePathname();
  const { layout, triggerHaptic } = useResponsiveNav();
  const shellMotionReady = useShellMotionReady();
  const focusModeFromStore = useMobileBottomNavFocusMode();
  const onPipelineSurface = resolvePipelineSurfaceRoute(pathname);
  const domMountLock =
    PHASE_24_4L_DOM_MOUNT_LOCK && onPipelineSurface;
  const navLocked =
    onPipelineSurface &&
    (PHASE_24_4J_PIPELINE_NAV_LOCK || domMountLock);
  const hideBottomNav =
    forceHidden ||
    (!navLocked && !domMountLock && focusModeFromStore);

  useLayoutEffect(() => {
    document.documentElement.toggleAttribute(
      "data-pipeline-bottom-nav-locked",
      navLocked,
    );
    document.documentElement.toggleAttribute(
      PIPELINE_NAV_DOM_LOCK_HTML_ATTR,
      domMountLock,
    );
    return () => {
      document.documentElement.removeAttribute("data-pipeline-bottom-nav-locked");
      document.documentElement.removeAttribute(PIPELINE_NAV_DOM_LOCK_HTML_ATTR);
    };
  }, [navLocked, domMountLock]);

  const [moreOpen, setMoreOpen] = useState(false);
  const navCtx = useNavigationConfigOptional();
  const resolved =
    navCtx?.resolvedItems ??
    resolveVisibleNavItems(navCtx?.config ?? defaultResolvedConfig());
  const bottomItems = useMemo(() => pickMobileBottomItems(resolved), [resolved]);
  const overflowItems = useMemo(
    () =>
      resolved.filter(
        (e) =>
          !MOBILE_BOTTOM_ID_SET.has(
            e.id as (typeof MOBILE_BOTTOM_SLOT_IDS)[number],
          ),
      ),
    [resolved],
  );

  const placement = bottomNavPlacementClass(layout, domMountLock);
  const overlayPlacement = bottomNavOverlayClass(layout, domMountLock);
  const touchTarget =
    layout.densityBucket === "high" ? "min-h-[3.5rem]" : "min-h-[3.25rem]";
  const iconOnlyBottom = layout.shell === "mobile";
  /**
   * Phone icon dock: pin glyphs to the *bottom* of the tap target so empty
   * min-height lives *above* the icon — never centered. Slight -mb pulls
   * glyphs into the remaining home-indicator pad (~2–8px, not full ~34px).
   * ~40px hit target retained.
   */
  const navItemTarget = iconOnlyBottom
    ? "min-h-10 justify-end pb-0 pt-2 -mb-1"
    : touchTarget;

  const navBottom = useMemo(
    () =>
      bottomNavFixedBottom({
        keyboardInsetBottomPx: layout.keyboardInsetBottom,
      }),
    [layout.keyboardInsetBottom],
  );

  const navVisibilityLocked = (navLocked || domMountLock) && !forceHidden;

  return (
    <>
      <nav
        className={cn(
          /* Edge-to-edge dock: continuous surface to the physical bottom. */
          "fixed inset-x-0 bottom-0 z-40 w-full max-w-none",
          placement,
          "flex flex-col border-0 border-t border-border/40",
          "bg-background supports-[backdrop-filter]:bg-background/95 backdrop-blur-md",
          /* No elevation shadow — avoid floating-island look over home indicator. */
          NAV_SAFE_X,
          NAV_PX,
          "max-md:[backface-visibility:hidden]",
          navVisibilityLocked
            ? cn(
                domMountLock
                  ? PIPELINE_BOTTOM_NAV_DOM_LOCK_CLASS
                  : PIPELINE_BOTTOM_NAV_FORCE_VISIBLE_CLASS,
                "!transition-none",
              )
            : cn(
                shellMotionReady
                  ? "max-md:transition-[transform,opacity] max-md:duration-[300ms]"
                  : "transition-none",
                shellMotionReady ? shellMotionTw.tabletFocusSlide : "",
                hideBottomNav
                  ? mobileFocusBottomNavHidden
                  : mobileFocusBottomNavVisible,
              ),
          "max-md:landscape:min-h-0",
        )}
        style={{
          ...shellZIndexStyle("bottomNav"),
          bottom: navBottom,
          /* Minimal home-indicator pad (≪ full inset) — icons sit lower. */
          paddingBottom: safeAreaBottom(),
          ...(navVisibilityLocked
            ? {
                transform: "translate3d(0, 0, 0)",
                opacity: 1,
                visibility: "visible",
                display: "flex",
              }
            : forceHidden
              ? {
                  transform: "translate3d(0, 100%, 0)",
                  opacity: 0,
                  visibility: "hidden",
                  pointerEvents: "none",
                }
              : {}),
        }}
        aria-label="Primary"
        aria-hidden={forceHidden ? true : false}
        data-pipeline-static-bottom-nav={
          navVisibilityLocked ? "true" : undefined
        }
        data-pipeline-nav-dom-lock={domMountLock ? "true" : undefined}
        data-dlc-component="MobileBottomNav"
        data-saas-menu-covered={forceHidden ? "true" : undefined}
      >
        {/* Top breath only; safe-area is solely on <nav> paddingBottom. */}
        <div
          className={cn(
            "mx-auto flex w-full max-w-7xl justify-around gap-0 px-1 pt-1",
            /* End-align so stretch tall cells do not float icons mid-band. */
            iconOnlyBottom ? "items-end" : "items-stretch",
          )}
        >
          {bottomItems.map((e) => {
            const Icon = navIconForKey(e.iconKey);
            const active = entryActive(pathname, e);
            return (
              <Link
                key={e.id}
                href={e.href}
                data-product-tour={e.productTourId}
                aria-current={active ? "page" : undefined}
                aria-label={e.label}
                onClick={() => triggerHaptic("selection")}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 text-[10px] font-medium touch-manipulation",
                  iconOnlyBottom ? null : "justify-center py-1",
                  shellMotionTw.navLinkTone,
                  navItemTarget,
                  navFocusRingClass,
                  active
                    ? "bg-primary/[0.09] text-primary shadow-[inset_0_0_0_1px_rgb(var(--primary)/0.18)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span
                  className={cn(
                    "truncate whitespace-nowrap text-center leading-tight",
                    iconOnlyBottom && "sr-only",
                  )}
                >
                  {e.label}
                </span>
              </Link>
            );
          })}
          {overflowItems.length > 0 ? (
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 text-[10px] font-medium touch-manipulation",
                iconOnlyBottom ? null : "justify-center py-1",
                shellMotionTw.navLinkTone,
                navItemTarget,
                navFocusRingClass,
                "text-muted-foreground hover:text-foreground",
              )}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              aria-label="More navigation"
              onClick={() => {
                triggerHaptic("light");
                setMoreOpen(true);
              }}
            >
              <Menu className="h-5 w-5 shrink-0" aria-hidden />
              <span
                className={cn(
                  "truncate whitespace-nowrap text-center leading-tight",
                  iconOnlyBottom && "sr-only",
                )}
              >
                More
              </span>
            </button>
          ) : null}
        </div>
      </nav>

      {moreOpen && overflowItems.length > 0 ? (
        <div
          className={cn("fixed inset-0", overlayPlacement)}
          style={shellZIndexStyle("sheet")}
          role="dialog"
          aria-modal
          aria-label="More navigation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className={cn(
              "absolute bottom-0 left-0 right-0 max-h-[min(70dvh,520px)] overflow-y-auto touch-scroll-y overscroll-contain rounded-t-xl border border-border bg-background p-4 shadow-[var(--dlc-elevation-4)]",
              shellMotionTw.sheetBody,
            )}
            style={{
              ...shellPanelZIndex("sheet"),
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">More</span>
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
                onClick={() => setMoreOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <ul className="space-y-1" role="list">
              {overflowItems.map((e) => {
                const Icon = navIconForKey(e.iconKey);
                const active = entryActive(pathname, e);
                return (
                  <li key={e.id}>
                    <Link
                      href={e.href}
                      data-product-tour={e.productTourId}
                      onClick={() => {
                        triggerHaptic("selection");
                        setMoreOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                        navFocusRingClass,
                        active
                          ? "bg-muted text-foreground"
                          : "text-foreground/90 hover:bg-muted/80",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                      {e.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
});
