"use client";



import Link from "next/link";

import type { ReactNode } from "react";

import { ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/cn";

import {

  OP_BORDER_SOFT,

  OP_DISCLOSURE_TRANSITION,

  OP_TEXT_SECONDARY,

} from "@/lib/ui/operationalTokens";

import {

  OP_CHIP_FILTER,

  OP_ENTITY_TITLE,

  OP_SCAN_TERTIARY,

  OP_WARNING_TEXT,

} from "@/lib/ui/operationalElegance";



export type OrientationCrumb = {

  label: string;

  href?: string;

  onClick?: () => void;

};



export type OrientationPill = {

  id: string;

  label: string;

  onRemove?: () => void;

};



type OperationalOrientationStripProps = {

  scopeLabel?: string;

  modeLabel?: string;

  modeDescription?: string;

  crumbs?: OrientationCrumb[];

  pills?: OrientationPill[];

  searchHint?: string;

  accessHint?: string;

  trailing?: ReactNode;

  sticky?: boolean;

  /** Hide redundant scope when mode is the dominant anchor (hub). */

  suppressScopeWhenMode?: boolean;

  /** Cap visible filter pills — remainder summarized. */

  maxPills?: number;

  /** Single-row crumbs + trailing (pipeline deal header). */

  compactLayout?: boolean;

  className?: string;

  "data-testid"?: string;

};



/**

 * Compact operational context — one dominant emphasis per band.

 */

export function OperationalOrientationStrip({

  scopeLabel,

  modeLabel,

  modeDescription,

  crumbs = [],

  pills = [],

  searchHint,

  accessHint,

  trailing,

  sticky = true,

  suppressScopeWhenMode = false,

  maxPills = 4,

  compactLayout = false,

  className,

  "data-testid": testId,

}: OperationalOrientationStripProps) {

  const hasCrumbs = crumbs.length > 0;

  const visiblePills = pills.slice(0, maxPills);

  const hiddenPillCount = Math.max(0, pills.length - maxPills);

  const showScope =

    scopeLabel && !(suppressScopeWhenMode && modeLabel);



  const crumbNav = hasCrumbs ? (

    <nav

      aria-label="Hierarchy path"

      className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground/80 max-md:overflow-visible md:flex-nowrap md:overflow-x-auto md:touch-pan-x"

    >

      {crumbs.map((crumb, i) => (

        <span

          key={`${crumb.label}-${i}`}

          className="inline-flex min-w-0 max-w-[12rem] items-center gap-1 sm:max-w-none"

        >

          {i > 0 ? (

            <ChevronRight

              className="h-3 w-3 shrink-0 opacity-40"

              aria-hidden

            />

          ) : null}

          {crumb.href ? (

            <Link

              href={crumb.href}

              className="max-md:break-words max-md:whitespace-normal max-md:[overflow-wrap:anywhere] md:truncate text-foreground/75 hover:text-foreground hover:underline"

            >

              {crumb.label}

            </Link>

          ) : crumb.onClick ? (

            <button

              type="button"

              onClick={crumb.onClick}

              className="max-md:break-words max-md:whitespace-normal max-md:[overflow-wrap:anywhere] md:truncate text-foreground/75 hover:text-foreground hover:underline"

            >

              {crumb.label}

            </button>

          ) : (

            <span className="max-md:break-words max-md:whitespace-normal max-md:[overflow-wrap:anywhere] md:truncate text-foreground/90">

              {crumb.label}

            </span>

          )}

        </span>

      ))}

    </nav>

  ) : null;



  if (compactLayout) {

    return (

      <div

        data-testid={testId}

        className={cn(

          "flex min-h-9 w-full min-w-0 max-w-full items-center justify-between gap-2",

          className,

        )}

      >

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto touch-pan-x">

          {crumbNav}

          {accessHint ? (

            <span className={cn("shrink-0", OP_WARNING_TEXT, "text-[11px]")}>

              {accessHint}

            </span>

          ) : null}

        </div>

        {trailing ? (

          <div className="flex shrink-0 items-center gap-1">{trailing}</div>

        ) : null}

      </div>

    );

  }



  return (

    <div

      data-testid={testId}

      className={cn(

        "min-w-0 max-w-full",

        sticky &&

          "sticky top-0 z-[calc(var(--dlc-z-header,20)+1)] border-b bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80",

        OP_BORDER_SOFT,

        className,

      )}

    >

      <div

        className={cn(

          "flex min-w-0 flex-col gap-1 px-2 py-2 sm:gap-1.5 sm:px-3",

          OP_DISCLOSURE_TRANSITION,

        )}

      >

        <div className="flex min-w-0 items-start gap-2">

          <div className="min-w-0 flex-1 overflow-x-auto touch-pan-x">

            <div className="flex min-w-max flex-col gap-0.5 sm:min-w-0 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2.5 sm:gap-y-0.5">

              {showScope ? (

                <span className={cn("shrink-0 uppercase tracking-wide", OP_SCAN_TERTIARY)}>

                  {scopeLabel}

                </span>

              ) : null}

              {modeLabel ? (

                <span
                  className={cn(
                    "max-md:block max-md:w-full max-md:break-words max-md:whitespace-normal max-md:[overflow-wrap:anywhere]",
                    "md:shrink-0",
                    OP_ENTITY_TITLE,
                  )}
                  data-testid="workspace-orientation-entity-label"
                >
                  {modeLabel}
                </span>

              ) : null}

              {modeDescription ? (

                <span className={cn("hidden shrink-0 lg:inline", OP_TEXT_SECONDARY)}>

                  {modeDescription}

                </span>

              ) : null}

              {searchHint ? (

                <span

                  className={cn("shrink-0", OP_CHIP_FILTER)}

                  data-testid="orientation-search-hint"

                >

                  {searchHint}

                </span>

              ) : null}

              {accessHint ? (

                <span className={cn("shrink-0", OP_WARNING_TEXT, "text-[11px]")}>

                  {accessHint}

                </span>

              ) : null}

            </div>

          </div>

          {trailing ? (

            <div className="flex shrink-0 items-center gap-1">{trailing}</div>

          ) : null}

        </div>



        {hasCrumbs ? crumbNav : null}



        {visiblePills.length > 0 ? (

          <div

            className="hidden min-w-0 flex-wrap items-center gap-1 md:flex"

            aria-label="Active filters"

          >

            {visiblePills.map((pill) => (

              <span key={pill.id} className={OP_CHIP_FILTER}>

                <span className="truncate">{pill.label}</span>

                {pill.onRemove ? (

                  <button

                    type="button"

                    className="shrink-0 rounded-full p-0.5 text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground"

                    aria-label={`Remove filter ${pill.label}`}

                    onClick={pill.onRemove}

                  >

                    <X className="h-3 w-3" aria-hidden />

                  </button>

                ) : null}

              </span>

            ))}

            {hiddenPillCount > 0 ? (

              <span className={OP_SCAN_TERTIARY}>+{hiddenPillCount} filters</span>

            ) : null}

          </div>

        ) : null}

      </div>

    </div>

  );

}

