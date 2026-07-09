"use client";

import { Eye, Pencil } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ResourceAccessBannerMode } from "@/lib/resourceAccessUx";

type Props = {
  mode: ResourceAccessBannerMode;
  ownerDisplayUsername?: string;
  resourceKind?: "pipeline" | "task" | "event";
  className?: string;
};

/**
 * Sticky share-access banner — view (neutral) or edit (soft green). No motion.
 */
export function ResourceAccessBanner({
  mode,
  ownerDisplayUsername,
  resourceKind = "pipeline",
  className,
}: Props) {
  if (mode === "none") return null;

  const isView = mode === "view";
  const isCoOwner = mode === "co_owner";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "border-b px-3 py-2 sm:px-4",
        isView
          ? "border-border/60 bg-muted/50 text-muted-foreground"
          : isCoOwner
            ? "border-sky-500/25 bg-sky-500/[0.08] text-sky-950 dark:text-sky-100"
            : "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-950 dark:text-emerald-100",
        className,
      )}
    >
      <div className="mx-auto flex max-w-4xl items-start gap-2 text-xs leading-snug sm:text-sm">
        {isView ? (
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        ) : (
          <Pencil
            className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80"
            aria-hidden
          />
        )}
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold tracking-tight">
            {isView
              ? "View Only Access"
              : isCoOwner
                ? "Co-owner Access"
                : "Edit Access"}
          </p>
          <p className="font-normal opacity-90">
            {isView ? (
              resourceKind === "event" ? (
                <>
                  You can view this event but cannot make changes unless the
                  owner upgrades your access.
                </>
              ) : resourceKind === "task" ? (
                <>
                  You can view this task but cannot make changes unless the
                  owner upgrades your access.
                </>
              ) : (
                <>
                  You can view this pipeline file but cannot make changes unless
                  the owner upgrades your access.
                </>
              )
            ) : isCoOwner ? (
              <>
                You can edit, share, and manage collaborators on this event.
                Ownership remains with{" "}
                <span className="font-medium">
                  {ownerDisplayUsername?.trim() || "the owner"}
                </span>
                .
              </>
            ) : resourceKind === "event" ? (
              <>
                You can edit this shared event. Ownership remains with{" "}
                <span className="font-medium">
                  {ownerDisplayUsername?.trim() || "the owner"}
                </span>
                .
              </>
            ) : resourceKind === "task" ? (
              <>
                You can edit this shared task. Ownership remains with{" "}
                <span className="font-medium">
                  {ownerDisplayUsername?.trim() || "the owner"}
                </span>
                .
              </>
            ) : (
              <>
                You can edit this shared pipeline file. Ownership remains with{" "}
                <span className="font-medium">
                  {ownerDisplayUsername?.trim() || "the owner"}
                </span>
                .
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
