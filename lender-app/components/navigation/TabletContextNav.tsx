"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { navIconForKey } from "@/lib/navigation/navIcons";
import {
  isActivePath,
  isPipelineZonePath,
} from "@/lib/navigation/navPathUtils";
import { useNavigationConfigOptional } from "@/components/navigation/NavigationConfigProvider";
import {
  defaultResolvedConfig,
  resolveVisibleNavItems,
} from "@/lib/navigation/navigationResolve";
import type { NavCatalogEntry } from "@/lib/navigation/navigationCatalog";
import { useResponsiveNav } from "@/components/navigation/ResponsiveNavProvider";
import { navFocusRingClass } from "@/lib/navigation/navFocusRing";

/**
 * Tablet-only (md–lg) compact icon strip for classic chrome — hybrid nav discipline.
 */
export function TabletContextNav() {
  const { layout } = useResponsiveNav();
  const pathname = usePathname();
  const navCtx = useNavigationConfigOptional();

  if (!layout.useTabletContextStrip) return null;

  const resolved =
    navCtx?.resolvedItems ??
    resolveVisibleNavItems(navCtx?.config ?? defaultResolvedConfig());

  const tabletIds = ["pipeline", "tasks", "contacts", "lenders", "activity"];
  const map = new Map(resolved.map((e) => [e.id, e]));
  const strip: NavCatalogEntry[] = tabletIds
    .map((id) => map.get(id))
    .filter((e): e is NavCatalogEntry => e != null);

  return (
    <nav className="hidden w-full min-w-0 border-t border-border/60 px-2 py-2 max-lg:flex lg:hidden" aria-label="Quick navigation">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-1">
        {strip.map((e) => {
          const Icon = navIconForKey(e.iconKey);
          const active = e.pipelineGroup
            ? isPipelineZonePath(pathname)
            : isActivePath(pathname, e.href);
          return (
            <Link
              key={e.id}
              href={e.href}
              data-product-tour={e.productTourId}
              title={e.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 min-w-[2.5rem] items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
                navFocusRingClass,
                active
                  ? "bg-brand-accent text-brand-accent-foreground shadow-sm"
                  : "bg-muted/50 text-foreground/85 hover:bg-muted hover:text-foreground",
                "motion-safe:active:scale-[0.98] motion-safe:transition-transform motion-safe:duration-100 motion-reduce:active:scale-100",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">{e.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
