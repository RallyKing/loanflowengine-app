"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { AdaptiveCollapsedNavRail } from "@/components/navigation/AdaptiveCollapsedNavRail";
import { SaasSidebar } from "@/components/SaasSidebar";
import { useShellMotionReady } from "@/components/layout/ShellMotionReadyContext";
import { cn } from "@/lib/cn";
import { shellMotionTw } from "@/lib/ui/motionTokens";

type UnifiedSidebarRailProps = {
  saasDesktopSidebarOpen: boolean;
  saasMenuOpen: boolean;
  setSaasDesktopSidebarOpenPersist: (open: boolean) => void;
  setSaasMenuOpen: Dispatch<SetStateAction<boolean>>;
};

/**
 * Desktop: one sticky column animates between icon-rail and full sidebar width
 * while expanded/collapsed panels crossfade — avoids hard remounts and width bulges.
 * Mobile: `SaasSidebar` keeps its existing fixed drawer behavior.
 */
export function UnifiedSidebarRail({
  saasDesktopSidebarOpen,
  saasMenuOpen,
  setSaasDesktopSidebarOpenPersist,
  setSaasMenuOpen,
}: UnifiedSidebarRailProps): ReactNode {
  const motionReady = useShellMotionReady();

  return (
    <>
      <div
        className={cn(
          "relative hidden shrink-0 overflow-hidden border-r border-white/5 bg-nav-sidebar md:block",
          "md:sticky md:top-0 md:h-dvh md:max-h-dvh md:self-start",
          motionReady ? shellMotionTw.sidebarRailWidth : "md:transition-none",
          saasDesktopSidebarOpen
            ? "md:w-64 md:min-w-64 md:max-w-64"
            : "md:w-12 md:min-w-12 md:max-w-12",
        )}
        data-testid="unified-sidebar-rail"
        data-sidebar-expanded={saasDesktopSidebarOpen ? "true" : "false"}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-64",
            motionReady ? shellMotionTw.sidebarRailFade : null,
            saasDesktopSidebarOpen
              ? "z-10 opacity-100"
              : "pointer-events-none z-0 opacity-0",
          )}
          aria-hidden={!saasDesktopSidebarOpen}
        >
          <SaasSidebar
            variant="desktopEmbedded"
            mobileOpen
            desktopExpanded
            motionReady={motionReady}
            onNavLinkClick={() => setSaasMenuOpen(false)}
            onCollapseDesktop={() => setSaasDesktopSidebarOpenPersist(false)}
          />
        </div>
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-12",
            motionReady ? shellMotionTw.sidebarRailFade : null,
            !saasDesktopSidebarOpen
              ? "z-10 opacity-100"
              : "pointer-events-none z-0 opacity-0",
          )}
          aria-hidden={saasDesktopSidebarOpen}
        >
          <AdaptiveCollapsedNavRail
            embedded
            visible
            motionReady={motionReady}
            onExpand={() => setSaasDesktopSidebarOpenPersist(true)}
            onNavClick={() => setSaasMenuOpen(false)}
          />
        </div>
      </div>

      {/* Mobile drawer only — desktop rail above is `md:block`. */}
      <div className="md:hidden" data-testid="unified-sidebar-rail-mobile">
        <SaasSidebar
          variant="default"
          mobileOpen={saasMenuOpen}
          desktopExpanded
          onNavLinkClick={() => setSaasMenuOpen(false)}
          onCloseMobile={() => setSaasMenuOpen(false)}
        />
      </div>
    </>
  );
}
