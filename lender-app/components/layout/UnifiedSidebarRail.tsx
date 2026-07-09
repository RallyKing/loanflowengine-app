"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { AdaptiveCollapsedNavRail } from "@/components/navigation/AdaptiveCollapsedNavRail";
import { SaasSidebar } from "@/components/SaasSidebar";

type UnifiedSidebarRailProps = {
  saasDesktopSidebarOpen: boolean;
  saasMenuOpen: boolean;
  setSaasDesktopSidebarOpenPersist: (open: boolean) => void;
  setSaasMenuOpen: Dispatch<SetStateAction<boolean>>;
};

/**
 * Canonical sidebar stack: icon rail + `SaasSidebar` in document order with stable sticky behavior.
 */
export function UnifiedSidebarRail({
  saasDesktopSidebarOpen,
  saasMenuOpen,
  setSaasDesktopSidebarOpenPersist,
  setSaasMenuOpen,
}: UnifiedSidebarRailProps): ReactNode {
  return (
    <div className="flex shrink-0 flex-col md:contents" data-testid="unified-sidebar-rail">
      {!saasDesktopSidebarOpen ? (
        <AdaptiveCollapsedNavRail
          onExpand={() => setSaasDesktopSidebarOpenPersist(true)}
          onNavClick={() => setSaasMenuOpen(false)}
        />
      ) : null}
      <SaasSidebar
        mobileOpen={saasMenuOpen}
        desktopExpanded={saasDesktopSidebarOpen}
        onNavLinkClick={() => setSaasMenuOpen(false)}
        onCloseMobile={() => setSaasMenuOpen(false)}
        onCollapseDesktop={() => setSaasDesktopSidebarOpenPersist(false)}
      />
    </div>
  );
}
