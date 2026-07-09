"use client";

import { cn } from "@/lib/cn";
import { semanticBadgeClasses } from "@/lib/design-system/semanticTokens";
import { Link2, Unlink } from "lucide-react";

export type FieldSyncSource = "shared" | "override" | "local";

const LABELS: Record<FieldSyncSource, string> = {
  shared: "File-linked",
  override: "Block override",
  local: "Unsaved change",
};

const DESCRIPTIONS: Record<FieldSyncSource, string> = {
  shared:
    "This value is tied to the shared field on the file. Edits here propagate to every block that reads the same field.",
  override:
    "This block keeps a separate copy for layout or reporting. The shared file field stays unchanged until you align it. Overrides are intentional—document why if another operator audits this file.",
  local:
    "You have edits on this device that are not yet written to the shared file. They will be lost if you leave before save completes.",
};

/**
 * Operator-facing sync truth — plain language, no internal jargon.
 * Uses semantic trust tokens (info / warning / attention).
 */
export function FieldSyncIndicator({
  source,
  className,
  id,
}: {
  source: FieldSyncSource;
  className?: string;
  /** Optional id for aria-describedby on the controlling input. */
  id?: string;
}) {
  const style =
    source === "override"
      ? semanticBadgeClasses.warning
      : source === "local"
        ? semanticBadgeClasses.attention
        : semanticBadgeClasses.info;

  return (
    <span
      id={id}
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide",
        style,
        className,
      )}
      title={DESCRIPTIONS[source]}
    >
      {source === "override" || source === "local" ? (
        <Unlink
          className={cn("h-3 w-3", source === "local" && "opacity-80")}
          aria-hidden
        />
      ) : (
        <Link2 className="h-3 w-3" aria-hidden />
      )}
      {LABELS[source]}
    </span>
  );
}

/** Long-form copy for helper text or documentation. */
export function getFieldSyncDescription(source: FieldSyncSource): string {
  return DESCRIPTIONS[source];
}
