"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import Link from "next/link";
import { APP_DISPLAY_NAME, APP_MONOGRAM } from "@/lib/brandIdentity";
import { Menu } from "lucide-react";
import { cn } from "@/lib/cn";

type MobileTopNavProps = {
  saasMenuOpen: boolean;
  setSaasMenuOpen: Dispatch<SetStateAction<boolean>>;
  trailing: ReactNode;
  /** Phone shell: single-row chrome — menu | centered mark | actions (Phase 11.8.1). */
  compactBrand?: boolean;
  /** Phase 24.4P — fixed 64px row; no scroll-linked height changes. */
  layoutLocked?: boolean;
};

/**
 * SaaS shell: mobile/tablet top strip (hamburger + brand + actions cluster).
 * Scroll morph is handled only by {@link MasterHeaderShell} — no binary collapse.
 *
 * **Phone (`compactBrand`):** one horizontal row only (48–56px clamp). No wrapped
 * flex rows, no stacked title — centered brand mark only.
 */
export function MobileTopNav({
  saasMenuOpen,
  setSaasMenuOpen,
  trailing,
  compactBrand = false,
  layoutLocked = false,
}: MobileTopNavProps): ReactNode {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-7xl px-2 sm:px-4 md:px-6",
        compactBrand
          ? cn(
              "max-md:grid max-md:grid-cols-[2.25rem_minmax(0,1fr)_auto] max-md:items-center max-md:gap-1 max-md:overflow-hidden max-md:py-0",
              layoutLocked
                ? "max-md:h-16 max-md:min-h-16 max-md:max-h-16"
                : "max-md:h-12 max-md:max-h-14 max-md:min-h-12",
            )
          : cn(
              "flex max-md:flex-nowrap max-md:items-center max-md:justify-between max-md:gap-2 max-md:overflow-hidden",
              layoutLocked
                ? "max-md:h-16 max-md:min-h-16 max-md:max-h-16 max-md:py-0"
                : "max-md:min-h-12 max-md:max-h-14 max-md:py-2",
            ),
        "md:flex md:min-h-0 md:max-h-none md:items-center md:justify-between md:gap-3 md:py-3",
      )}
    >
      <button
        type="button"
        className={cn(
          "inline-flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm hover:bg-muted md:hidden",
          compactBrand && "max-md:col-start-1 max-md:row-start-1",
        )}
        aria-label="Toggle primary navigation"
        aria-expanded={saasMenuOpen}
        onClick={() => setSaasMenuOpen((o) => !o)}
      >
        <Menu className="h-5 w-5 shrink-0" aria-hidden />
      </button>
      {compactBrand ? (
        <Link
          href="/tasks"
          className={cn(
            "min-w-0 shrink-0 overflow-hidden md:hidden",
            "max-md:col-start-2 max-md:row-start-1 max-md:flex max-md:justify-center",
          )}
          aria-label={`${APP_DISPLAY_NAME} home`}
        >
          <span className="grid h-10 w-10 place-items-center rounded-dlc-sm bg-brand text-xs font-bold text-brand-foreground shadow-dlc-2 ring-1 ring-brand-accent/35">
            {APP_MONOGRAM}
          </span>
        </Link>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground md:hidden">
          {APP_DISPLAY_NAME}
        </span>
      )}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-1 overflow-x-hidden sm:gap-2 md:max-w-none md:flex-initial md:gap-3 md:overflow-visible",
          compactBrand && "max-md:col-start-3 max-md:row-start-1 max-md:flex-initial",
        )}
      >
        {trailing}
      </div>
    </div>
  );
}
