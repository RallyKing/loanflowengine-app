"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/Tooltip";
import { actionSuiteRevealOnRowHover } from "@/components/ui/ActionSuite";
import { opHoverPrimaryClass } from "@/lib/ui/operationalHover";
import { OP_ENTITY_TITLE } from "@/lib/ui/operationalElegance";
import { mobilePrimaryTitleClass } from "@/lib/ui/mobileInformationHierarchy";

/** Shared row hover — use on every RowShell instance. */
export const rowShellHoverClass = opHoverPrimaryClass;

export const rowShellGroupClass = "group/row-shell";

export type RowShellDensity = "compact" | "default";

const densityClass: Record<RowShellDensity, string> = {
  compact: "min-h-10 py-1.5",
  default: "min-h-11 py-2",
};

type RowShellProps = {
  left?: ReactNode;
  primary: ReactNode;
  /** Tooltip when primary is a plain string label. */
  primaryTooltip?: string;
  primaryClassName?: string;
  meta?: ReactNode;
  /** Always-visible controls (inline editors) before hover-revealed actions. */
  trailing?: ReactNode;
  actions?: ReactNode;
  /** Phase 24.3A: full-width title tier + controls tier on max-md only. */
  stackOnMobile?: boolean;
  /** Rendered below the title row on max-md (badges, meta, actions). */
  mobileSecondary?: ReactNode;
  density?: RowShellDensity;
  className?: string;
  /** Whole-row click (e.g. expand); action zone stops propagation at call site. */
  onRowClick?: () => void;
  "aria-expanded"?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

/**
 * Unified list row layout: left chrome · title · metadata · hover-revealed actions.
 * Keep row height stable — do not put wrapping block content inside the shell;
 * render expansions as siblings below.
 */
export function RowShell({
  left,
  primary,
  primaryTooltip,
  primaryClassName,
  meta,
  trailing,
  actions,
  stackOnMobile = false,
  mobileSecondary,
  density = "compact",
  className,
  onRowClick,
  "aria-expanded": ariaExpanded,
  ...rest
}: RowShellProps) {
  const titleTooltip =
    primaryTooltip ?? (typeof primary === "string" ? primary : undefined);

  const primaryNode =
    typeof primary === "string" ? (
      <RowShellTitle
        className={primaryClassName}
        tooltip={titleTooltip}
        allowWrapOnMobile={stackOnMobile}
      >
        {primary}
      </RowShellTitle>
    ) : titleTooltip ? (
      <Tooltip content={titleTooltip}>
        <div
          className={cn(
            "min-w-0 flex-1 overflow-hidden",
            primaryClassName,
          )}
        >
          {primary}
        </div>
      </Tooltip>
    ) : (
      <div
        className={cn(
          "flex min-w-0 items-center gap-1.5 overflow-hidden",
          stackOnMobile &&
            "max-md:w-full max-md:flex-col max-md:items-start max-md:gap-1 max-md:overflow-visible",
          primaryClassName,
        )}
      >
        {primary}
      </div>
    );

  if (stackOnMobile) {
    return (
      <div
        data-row-shell
        data-row-shell-mobile-stack
        role={onRowClick ? "button" : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        aria-expanded={onRowClick ? ariaExpanded : undefined}
        onClick={onRowClick}
        onKeyDown={
          onRowClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick();
                }
              }
            : undefined
        }
        className={cn(
          rowShellGroupClass,
          "flex w-full min-w-0 flex-col gap-2 rounded-md px-2.5 max-md:py-2.5",
          densityClass[density],
          rowShellHoverClass,
          onRowClick && "cursor-pointer text-left",
          "md:flex-row md:items-center md:gap-2.5",
          className,
        )}
        {...rest}
      >
        <div className="flex w-full min-w-0 items-start gap-2 md:min-w-0 md:flex-1 md:items-center md:overflow-hidden">
          {left ? (
            <div className="flex shrink-0 items-center gap-1">{left}</div>
          ) : null}
          <div className="min-w-0 w-full flex-1 md:w-auto md:overflow-hidden">
            {primaryNode}
          </div>
          {meta ? (
            <RowShellMetadata className="hidden min-w-0 max-w-[min(100%,20rem)] shrink overflow-hidden sm:block">
              {meta}
            </RowShellMetadata>
          ) : null}
          {trailing ? (
            <div
              className="hidden shrink-0 items-center gap-1.5 md:flex"
              onClick={(e) => e.stopPropagation()}
            >
              {trailing}
            </div>
          ) : null}
          {actions ? (
            <div
              className={cn(
                "hub-row-action-rail hidden w-[9.25rem] min-w-[9.25rem] max-w-[9.25rem] shrink-0 grow-0 basis-[9.25rem] flex-none justify-end md:flex",
                actionSuiteRevealOnRowHover(),
              )}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {actions}
            </div>
          ) : null}
        </div>
        {mobileSecondary || meta || trailing || actions ? (
          <div
            className="flex w-full min-w-0 flex-wrap items-center gap-2 md:hidden"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {mobileSecondary ?? (
              <>
                {meta}
                {trailing}
                {actions}
              </>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-row-shell
      role={onRowClick ? "button" : undefined}
      tabIndex={onRowClick ? 0 : undefined}
      aria-expanded={onRowClick ? ariaExpanded : undefined}
      onClick={onRowClick}
      onKeyDown={
        onRowClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick();
              }
            }
          : undefined
      }
      className={cn(
        rowShellGroupClass,
        "flex w-full min-w-0 items-center gap-2.5 rounded-md px-2.5",
        densityClass[density],
        rowShellHoverClass,
        onRowClick && "cursor-pointer text-left",
        className,
      )}
      {...rest}
    >
      {left ? (
        <div className="flex shrink-0 items-center gap-1">{left}</div>
      ) : null}

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <div className="min-w-0 flex-1 basis-0 overflow-hidden">{primaryNode}</div>
        {meta ? (
          <RowShellMetadata className="hidden min-w-0 max-w-[min(100%,20rem)] shrink overflow-hidden sm:block">
            {meta}
          </RowShellMetadata>
        ) : null}
      </div>

      {trailing ? (
        <div
          className="flex shrink-0 items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {trailing}
        </div>
      ) : null}

      {actions ? (
        <div
          className={cn(
            "hub-row-action-rail flex w-[9.25rem] min-w-[9.25rem] max-w-[9.25rem] shrink-0 grow-0 basis-[9.25rem] flex-none justify-end",
            actionSuiteRevealOnRowHover(),
          )}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function RowShellTitle({
  children,
  className,
  tooltip,
  allowWrapOnMobile = false,
}: {
  children: ReactNode;
  className?: string;
  tooltip?: string;
  /** Phase 24.3A — multi-line titles on max-md. */
  allowWrapOnMobile?: boolean;
}) {
  const inner = (
    <span
      className={cn(
        "block min-w-0 truncate text-sm font-semibold leading-tight text-foreground",
        allowWrapOnMobile && mobilePrimaryTitleClass,
        className,
      )}
    >
      {children}
    </span>
  );

  if (tooltip?.trim()) {
    return <Tooltip content={tooltip.trim()}>{inner}</Tooltip>;
  }
  return inner;
}

/** Single-line metadata strip — prevents multi-line row height growth. */
export function RowShellMetadata({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 truncate text-[11px] leading-tight text-muted-foreground/75 tabular-nums",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function rowShellMetaItems(
  items: Array<{ label: string; value: string }>,
): ReactNode {
  return items.map((it, i) => (
    <span key={it.label} className="whitespace-nowrap">
      {i > 0 ? <span className="mx-1 text-muted-foreground/50">·</span> : null}
      <span className="font-medium text-foreground/70">{it.label}</span> {it.value}
    </span>
  ));
}
