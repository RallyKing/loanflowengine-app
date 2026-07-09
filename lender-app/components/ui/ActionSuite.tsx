"use client";

import type { HTMLAttributes, MouseEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { OP_ACTION_ICON_CLASS } from "@/lib/ui/operationalTokens";
import { opHoverActionRevealClass } from "@/lib/ui/operationalHover";
import { opMotionFastTransition } from "@/lib/ui/operationalMotion";

/** Touch-safe icon button for hub / list row action clusters. */
export const actionSuiteIconBtnClass = OP_ACTION_ICON_CLASS;

/** Reveal icon actions when parent uses `group/row-shell` (RowShell). */
export function actionSuiteRevealOnRowHover(className?: string): string {
  return opHoverActionRevealClass(className);
}

export function ActionSuite({
  children,
  className,
  "aria-label": ariaLabel = "Row actions",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  return (
    <div
      className={cn(
        "flex w-full shrink-0 flex-nowrap items-center justify-end gap-1 whitespace-nowrap",
        opMotionFastTransition,
        "max-md:gap-1.5",
        className,
      )}
      role="group"
      aria-label={ariaLabel}
      {...rest}
    >
      {children}
    </div>
  );
}

export function ActionSuiteIconButton({
  tooltip,
  testId,
  onClick,
  disabled,
  children,
  destructive,
}: {
  tooltip: string;
  testId: string;
  onClick: (e: MouseEvent) => void;
  disabled?: boolean;
  children: ReactNode;
  destructive?: boolean;
}) {
  return (
    <Tooltip content={tooltip}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          actionSuiteIconBtnClass,
          destructive &&
            "text-destructive/80 hover:bg-destructive/10 hover:text-destructive",
          disabled && "pointer-events-none opacity-40",
        )}
        data-testid={testId}
        disabled={disabled}
        aria-label={tooltip}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

export function ActionSuiteModal({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <OverlayShell
      open
      onClose={onClose}
      layer="MODAL"
      data-testid={testId}
      aria-labelledby={`${testId}-title`}
      panelClassName="p-4"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2
          id={`${testId}-title`}
          className="text-sm font-semibold text-foreground"
        >
          {title}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      {children}
    </OverlayShell>
  );
}
