"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { OP_SPACING } from "@/lib/ui/operationalTokens";
import {
  OP_SCAN_SECONDARY,
  opRowNestRailClass,
} from "@/lib/ui/operationalElegance";
import { OperationalDisclosureChevron } from "@/components/ui/OperationalDisclosure";
import {
  RowShell,
  RowShellMetadata,
  RowShellTitle,
  rowShellGroupClass,
  type RowShellDensity,
} from "@/components/ui/RowShell";
import { opHoverTertiaryRevealClass } from "@/lib/ui/operationalHover";

export type OperationalRowDensity = RowShellDensity | "comfortable";

const comfortableDensityClass = cn(OP_SPACING.rowMinH, OP_SPACING.rowPy, "py-2");

type OperationalRowShellProps = {
  left?: ReactNode;
  primary: ReactNode;
  primaryTooltip?: string;
  secondary?: ReactNode;
  tertiary?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
  stackOnMobile?: boolean;
  mobileSecondary?: ReactNode;
  density?: OperationalRowDensity;
  indentLevel?: number;
  /**
   * When true, tertiary chips / ownership stay visible (no md opacity-0 hover reveal).
   * Pipeline hub file rows use this so client/project/owner identity is always scannable.
   */
  alwaysShowTertiary?: boolean;
  disclosure?: {
    expanded: boolean;
    onToggle: () => void;
    "aria-label"?: string;
  };
  rowClassName?: string;
  onRowClick?: () => void;
  "aria-expanded"?: boolean;
  "data-testid"?: string;
};

/**
 * Operational list row — scan-first hierarchy with flowing nest rails.
 */
export function OperationalRowShell({
  left,
  primary,
  primaryTooltip,
  secondary,
  tertiary,
  meta,
  trailing,
  actions,
  stackOnMobile,
  mobileSecondary,
  density = "compact",
  indentLevel = 0,
  alwaysShowTertiary = false,
  disclosure,
  rowClassName,
  onRowClick,
  "aria-expanded": ariaExpanded,
  "data-testid": testId,
}: OperationalRowShellProps) {
  const shellDensity: RowShellDensity =
    density === "comfortable" ? "default" : density;

  const disclosureBtn = disclosure ? (
    <button
      type="button"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-muted/50",
        "h-8 w-8 max-md:h-11 max-md:w-11",
      )}
      aria-expanded={disclosure.expanded}
      aria-label={disclosure["aria-label"] ?? "Toggle section"}
      onClick={(e) => {
        e.stopPropagation();
        disclosure.onToggle();
      }}
    >
      <OperationalDisclosureChevron expanded={disclosure.expanded} axis="right" />
    </button>
  ) : null;

  const metaContent = meta ? (
    meta
  ) : secondary || tertiary ? (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5",
        alwaysShowTertiary ? "overflow-visible" : "overflow-hidden",
      )}
    >
      {secondary ? (
        <div className={cn("min-w-0 truncate", OP_SCAN_SECONDARY)}>
          {secondary}
        </div>
      ) : null}
      {tertiary ? (
        <div
          className={cn(
            "min-w-0",
            alwaysShowTertiary
              ? "overflow-visible opacity-100"
              : cn("overflow-hidden", opHoverTertiaryRevealClass()),
          )}
        >
          {tertiary}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      data-operational-row
      data-testid={testId}
      className={cn(
        rowShellGroupClass,
        opRowNestRailClass(indentLevel),
        density === "comfortable" && comfortableDensityClass,
      )}
    >
      <RowShell
        left={
          <>
            {disclosureBtn}
            {left}
          </>
        }
        primary={primary}
        primaryTooltip={primaryTooltip}
        meta={
          metaContent ? (
            <RowShellMetadata
              className={
                alwaysShowTertiary
                  ? "whitespace-normal overflow-visible"
                  : undefined
              }
            >
              {metaContent}
            </RowShellMetadata>
          ) : undefined
        }
        trailing={trailing}
        actions={actions}
        stackOnMobile={stackOnMobile}
        mobileSecondary={mobileSecondary}
        density={shellDensity}
        onRowClick={onRowClick}
        aria-expanded={ariaExpanded}
        className={rowClassName}
      />
    </div>
  );
}

export { RowShellTitle, RowShellMetadata };
