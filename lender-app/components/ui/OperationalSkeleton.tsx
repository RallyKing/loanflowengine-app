"use client";

import { cn } from "@/lib/cn";
import {
  OP_SKELETON_BLOCK_CLASS,
  OP_SKELETON_ROW_CLASS,
  OP_SKELETON_TEXT_CLASS,
} from "@/lib/ui/operationalFeedback";

type OperationalSkeletonRowProps = {
  className?: string;
  "data-testid"?: string;
};

/** Matches standard list row height (min-h-10). */
export function OperationalSkeletonRow({
  className,
  "data-testid": testId,
}: OperationalSkeletonRowProps) {
  return (
    <div
      data-testid={testId}
      className={cn(OP_SKELETON_ROW_CLASS, className)}
      aria-hidden
    />
  );
}

type OperationalSkeletonListProps = {
  rows?: number;
  className?: string;
  gapClassName?: string;
};

export function OperationalSkeletonList({
  rows = 5,
  className,
  gapClassName = "space-y-2",
}: OperationalSkeletonListProps) {
  return (
    <div className={cn(gapClassName, className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <OperationalSkeletonRow key={i} />
      ))}
    </div>
  );
}

type OperationalSkeletonPanelProps = {
  titleWidth?: string;
  blocks?: Array<{ height: string; className?: string }>;
  className?: string;
};

/** Workspace panel placeholder — geometry matches header + content blocks. */
export function OperationalSkeletonPanel({
  titleWidth = "w-2/3",
  blocks = [{ height: "h-28" }, { height: "h-28" }],
  className,
}: OperationalSkeletonPanelProps) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Loading">
      <div className={cn(OP_SKELETON_TEXT_CLASS, "h-9 max-w-sm", titleWidth)} />
      {blocks.map((b, i) => (
        <div
          key={i}
          className={cn(OP_SKELETON_BLOCK_CLASS, "w-full", b.height, b.className)}
        />
      ))}
    </div>
  );
}
