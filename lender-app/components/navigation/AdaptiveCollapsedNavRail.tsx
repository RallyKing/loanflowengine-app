"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  isActivePath,
  isPipelineZonePath,
} from "@/lib/navigation/navPathUtils";
import { navIconForKey } from "@/lib/navigation/navIcons";
import { useNavigationConfigOptional } from "@/components/navigation/NavigationConfigProvider";
import {
  defaultResolvedConfig,
  resolveVisibleNavItems,
} from "@/lib/navigation/navigationResolve";
import { navFocusRingClass } from "@/lib/navigation/navFocusRing";
import { shellMotionTw } from "@/lib/ui/motionTokens";

/**
 * SaaS collapsed left rail — icon targets from resolved navigation config.
 */
export function AdaptiveCollapsedNavRail({
  onExpand,
  onNavClick,
  visible = true,
  motionReady = true,
  embedded = false,
}: {
  onExpand: () => void;
  onNavClick?: () => void;
  /** When false and not embedded, collapses to zero width. */
  visible?: boolean;
  motionReady?: boolean;
  /** Fill animated shell from `UnifiedSidebarRail` (no own width/border). */
  embedded?: boolean;
}) {
  const pathname = usePathname();
  const navCtx = useNavigationConfigOptional();
  const resolved =
    navCtx?.resolvedItems ??
    resolveVisibleNavItems(navCtx?.config ?? defaultResolvedConfig());

  const itemClass = (active: boolean) =>
    cn(
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
      shellMotionTw.navLinkTone,
      navFocusRingClass,
      active
        ? "bg-white/15 text-white"
        : "text-white/88 hover:bg-white/10 hover:text-white",
    );

  const items = resolved.filter((e) => e.id !== "settings");
  const interactive = embedded || visible;

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-nav-sidebar text-nav-sidebar-foreground",
        embedded
          ? "w-full min-w-0 border-0"
          : cn(
              "hidden shrink-0 md:flex md:overflow-hidden",
              "border-r border-white/5",
              "md:sticky md:top-0 md:h-dvh md:max-h-dvh md:self-start",
              motionReady ? shellMotionTw.sidebarRailWidth : "md:transition-none",
              visible
                ? "md:w-12 md:min-w-12 md:max-w-12 md:opacity-100"
                : "md:w-0 md:min-w-0 md:max-w-0 md:opacity-0 md:pointer-events-none md:border-transparent",
            ),
      )}
      aria-label="Collapsed primary navigation"
      aria-hidden={!interactive}
    >
      <div className="flex h-14 w-full shrink-0 items-center justify-center border-b border-white/10">
        <button
          type="button"
          onClick={onExpand}
          tabIndex={interactive ? undefined : -1}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md text-white/90 hover:bg-white/10",
            shellMotionTw.navLinkTone,
            navFocusRingClass,
          )}
          aria-label="Expand navigation sidebar"
          title="Expand sidebar"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <nav
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden overscroll-contain px-0.5 py-2"
        aria-label="Collapsed primary navigation icons"
      >
        {items.map((e) => {
          const Icon = navIconForKey(e.iconKey);
          const pipelineActive = e.pipelineGroup && isPipelineZonePath(pathname);
          const pathActive =
            !e.pipelineGroup && isActivePath(pathname, e.href);
          const active = Boolean(pipelineActive || pathActive);
          return (
            <Link
              key={e.id}
              href={e.href}
              onClick={onNavClick}
              tabIndex={interactive ? undefined : -1}
              {...(e.productTourId
                ? { "data-product-tour": e.productTourId }
                : {})}
              className={itemClass(active)}
              aria-label={e.label}
              title={e.label}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
