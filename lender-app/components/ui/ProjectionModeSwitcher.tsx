"use client";



import Link from "next/link";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import { OP_BORDER_SOFT } from "@/lib/ui/operationalTokens";

import { opMotionFastTransition } from "@/lib/ui/operationalMotion";

import { OP_ACTIVE_REGION_RING, OP_SCAN_TERTIARY } from "@/lib/ui/operationalElegance";



export type ProjectionModeOption = {

  id: string;

  label: string;

  shortLabel?: string;

  description: string;

  icon: LucideIcon;

  count?: number;

  href?: string;

};



type ProjectionModeSwitcherProps = {

  options: ProjectionModeOption[];

  value: string;

  onChange: (id: string) => void;

  className?: string;

  compact?: boolean;

  "data-testid"?: string;

};



/**

 * Perspective switcher — current mode is visually dominant; inactive modes stay quiet.

 */

export function ProjectionModeSwitcher({

  options,

  value,

  onChange,

  className,

  compact = false,

  "data-testid": testId = "projection-mode-switcher",

}: ProjectionModeSwitcherProps) {

  return (

    <div

      className={cn("min-w-0 max-w-full", className)}

      data-testid={testId}

      role="group"

      aria-label="Projection perspective"

    >

      <div

        className={cn(

          "flex min-w-0 gap-px overflow-x-auto rounded-lg bg-muted/15 p-0.5 touch-pan-x",

          OP_BORDER_SOFT,

          opMotionFastTransition,

        )}

      >

        {options.map((opt) => {

          const selected = opt.id === value;

          const Icon = opt.icon;

          const showIcon = !compact && selected;

          const inner = (

            <>

              {showIcon ? (

                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />

              ) : null}

              <span className="truncate">

                {compact && opt.shortLabel ? opt.shortLabel : opt.label}

              </span>

              {typeof opt.count === "number" && selected ? (

                <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/80">

                  {opt.count}

                </span>

              ) : null}

            </>

          );

          const btnClass = cn(

            "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium max-md:min-h-11",

            opMotionFastTransition,

            compact ? "max-md:px-2.5" : "px-2.5 max-md:px-3",

            selected

              ? cn(

                  "bg-background font-semibold text-foreground shadow-sm",

                  OP_ACTIVE_REGION_RING,

                )

              : "text-muted-foreground/80 hover:bg-background/50 hover:text-foreground",

          );

          if (opt.href) {

            return (

              <Link

                key={opt.id}

                href={opt.href}

                className={btnClass}

                aria-current={selected ? "page" : undefined}

                title={opt.description}

              >

                {inner}

              </Link>

            );

          }

          return (

            <button

              key={opt.id}

              type="button"

              className={btnClass}

              aria-pressed={selected}

              title={opt.description}

              onClick={() => onChange(opt.id)}

            >

              {inner}

            </button>

          );

        })}

      </div>

      <p className={cn("mt-1 hidden max-w-xl lg:block", OP_SCAN_TERTIARY)} aria-live="polite">

        {options.find((o) => o.id === value)?.description}

      </p>

    </div>

  );

}

