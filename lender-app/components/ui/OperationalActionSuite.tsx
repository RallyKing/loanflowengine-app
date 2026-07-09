"use client";

import type { MouseEvent, ReactNode } from "react";
import {
  Archive,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { OP_ACTION_ICON_CLASS } from "@/lib/ui/operationalTokens";
import {
  ActionSuite,
  ActionSuiteIconButton,
  ActionSuiteModal,
  actionSuiteRevealOnRowHover,
} from "@/components/ui/ActionSuite";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { Button } from "@/components/ui/Button";

export {
  ActionSuite as OperationalActionSuite,
  actionSuiteRevealOnRowHover as operationalActionRevealOnRowHover,
};

/** Phase 18.3 — progressive action grouping on rows. */
export function operationalActionGroupClass(className?: string): string {
  return cn(
    "flex shrink-0 items-center gap-0.5 rounded-md p-0.5",
    "md:gap-1 md:opacity-0 md:transition-[opacity,transform] md:duration-[140ms] md:ease-out",
    "md:group-hover/row-shell:opacity-100 md:group-focus-within/row-shell:opacity-100",
    "max-md:gap-1.5 max-md:opacity-100",
    className,
  );
}

export const operationalActionIconClass = OP_ACTION_ICON_CLASS;

export function OperationalActionSuiteButton({
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
    <ActionSuiteIconButton
      tooltip={tooltip}
      testId={testId}
      onClick={onClick}
      disabled={disabled}
      destructive={destructive}
    >
      {children}
    </ActionSuiteIconButton>
  );
}

export function OperationalActionSuiteModal(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId: string;
}) {
  return <ActionSuiteModal {...props} />;
}

/** Standard icons — same glyphs across client / project / file tiers. */
export const OperationalActionIcons = {
  add: Plus,
  edit: Pencil,
  delete: Trash2,
  share: Share2,
  archive: Archive,
  duplicate: Copy,
} as const;

type MoreMenuItem = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

export function OperationalActionSuiteMore({
  items,
  "aria-label": ariaLabel = "More actions",
}: {
  items: MoreMenuItem[];
  "aria-label"?: string;
}) {
  return (
    <DropdownMenu
      aria-label={ariaLabel}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={operationalActionIconClass}
          aria-label={ariaLabel}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      }
    >
      {items.map((item, i) => (
        <span key={item.id}>
          {i > 0 && item.destructive && !items[i - 1]?.destructive ? (
            <DropdownMenuSeparator />
          ) : null}
          <DropdownMenuItem
            onClick={item.onClick}
            disabled={item.disabled}
            destructive={item.destructive}
          >
            {item.label}
          </DropdownMenuItem>
        </span>
      ))}
    </DropdownMenu>
  );
}
