"use client";

import { formatRelativeTimestamp } from "@/lib/formatRelativeTimestamp";

/** Subtle relative time for how long the current triage label has been applied. */
export function LabelAppliedAtCaption({
  appliedAt,
  now,
}: {
  appliedAt?: number;
  /** Pass `evaluationTime` from file task lists for consistent "ago" text. */
  now?: number;
}) {
  if (appliedAt == null || appliedAt <= 0) return null;
  return (
    <span
      className="ml-2 text-[10px] leading-none text-muted-foreground"
      data-testid="triage-label-applied-at"
      title={new Date(appliedAt).toLocaleString()}
    >
      {formatRelativeTimestamp(appliedAt, now)}
    </span>
  );
}
