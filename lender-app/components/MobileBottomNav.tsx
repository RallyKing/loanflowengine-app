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
 */
export const MobileBottomNav = memo(function MobileBottomNav() {
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
    !navLocked && !domMountLock && focusModeFromStore;

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
  const navItemTarget = iconOnlyBottom ? "min-h-[2.75rem] py-1.5" : touchTarget;

  const navBottom = useMemo(
    () =>
      bottomNavFixedBottom({
        keyboardInsetBottomPx: layout.keyboardInsetBottom,
      }),
    [layout.keyboardInsetBottom],
  );

  const navVisibilityLocked = navLocked || domMountLock;

  return (
    <>
      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40 w-full max-w-none",
          placement,
          "rounded-none border-x-0",
          "border border-border/80 bg-background/92 backdrop-blur supports-[backdrop-filter]:bg-background/88 shadow-dlc-4",
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
          "max-md:landscape:min-h-0 max-md:landscape:py-0.5",
        )}
        style={{
          ...shellZIndexStyle("bottomNav"),
          bottom: navBottom,
          ...(navVisibilityLocked
            ? {
                transform: "translate3d(0, 0, 0)",
                opacity: 1,
                visibility: "visible",
                display: "flex",
              }
            : {}),
        }}
        aria-label="Primary"
        aria-hidden={false}
        data-pipeline-static-bottom-nav={
          navVisibilityLocked ? "true" : undefined
        }
        data-pipeline-nav-dom-lock={domMountLock ? "true" : undefined}
        data-dlc-component="MobileBottomNav"
      >
        <div
          className="mx-auto flex max-w-7xl items-stretch justify-around gap-0 px-1 pt-1"
          style={{
            paddingBottom: `max(0.5rem, ${safeAreaBottom()})`,
          }}
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
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-medium touch-manipulation",
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
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-medium touch-manipulation",
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
