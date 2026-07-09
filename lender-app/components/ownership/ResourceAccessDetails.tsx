"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { viewerAccessLevelLabel } from "@/lib/resourceOwnershipUi";
import type { ResourceOwnershipBadgeKind } from "@/lib/resourceOwnershipUi";

type Props = {
  resourceType: "task" | "pipeline";
  resourceId: string;
  organizationId: Id<"organizations"> | undefined;
  memberUserKey: string | undefined;
  ownerDisplayUsername: string;
  ownershipLine: string;
  badge: ResourceOwnershipBadgeKind | null;
  viewerAccessLevel: "none" | "view" | "edit";
  isOwner: boolean;
  collaboratorCount: number;
  className?: string;
};

/**
 * Tap/click disclosure for owner, your access, and collaborators — no popover.
 */
export function ResourceAccessDetails({
  resourceType,
  resourceId,
  organizationId,
  memberUserKey,
  ownerDisplayUsername,
  ownershipLine,
  badge,
  viewerAccessLevel,
  isOwner,
  collaboratorCount,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const collabArgs =
    open && organizationId && memberUserKey?.trim()
      ? {
          resourceType,
          resourceId,
          organizationId,
          memberUserKey: memberUserKey.trim(),
        }
      : ("skip" as const);

  const collab = useQuery(
    api.resourceOwnershipPresentation.collaboratorsForResource,
    collabArgs,
  );

  const hasDetails =
    Boolean(ownerDisplayUsername) ||
    collaboratorCount > 0 ||
    badge != null;

  if (!hasDetails) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        {ownershipLine}
      </p>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        className="group flex w-full min-w-0 flex-col gap-0.5 rounded-md text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs font-medium text-foreground/90 group-hover:text-foreground">
          {ownershipLine}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {open ? "Hide access details" : "Access details"}
          {collaboratorCount > 0
            ? ` · ${collaboratorCount} collaborator${collaboratorCount === 1 ? "" : "s"}`
            : ""}
        </span>
      </button>
      {open ? (
        <dl className="mt-1.5 space-y-1 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[11px]">
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">Owner</dt>
            <dd className="min-w-0 font-medium text-foreground">
              {ownerDisplayUsername || "—"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">Your access</dt>
            <dd className="font-medium text-foreground">
              {viewerAccessLevelLabel(viewerAccessLevel, isOwner)}
            </dd>
          </div>
          {collaboratorCount > 0 ? (
            <div>
              <dt className="text-muted-foreground">
                Also has access ({collaboratorCount})
              </dt>
              <dd className="mt-1">
                {collab === undefined ? (
                  <span className="text-muted-foreground">Loading…</span>
                ) : (
                  <ul className="space-y-0.5">
                    {collab.collaborators.map((c) => (
                      <li
                        key={c.userId}
                        className="flex justify-between gap-2 font-medium text-foreground"
                      >
                        <span className="min-w-0 truncate">
                          {c.displayUsername}
                        </span>
                        <span className="shrink-0 capitalize text-muted-foreground">
                          {c.permission}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
