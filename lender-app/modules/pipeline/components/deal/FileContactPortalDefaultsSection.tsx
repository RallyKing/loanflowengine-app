"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { ExternalLink, Link2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import {
  PORTAL_DEFAULT_TYPE_LABELS,
  type PortalDefaultType,
} from "@/lib/portalDefaults";
import { cn } from "@/lib/cn";

export type FileContactPortalDefaultsSectionProps = {
  fileId: Id<"pipeline">;
  memberUserKey?: string;
  className?: string;
  /** Drag handle from Portals & Progress SortableSectionList. */
  headerRight?: ReactNode;
};

/**
 * Portals & Progress — surfaces assigned portal defaults for contacts linked
 * to this file (via contactFileLinks). Does not issue links; points brokers
 * to contact assignment + existing invite / link repository flows.
 */
export function FileContactPortalDefaultsSection({
  fileId,
  memberUserKey,
  className,
  headerRight,
}: FileContactPortalDefaultsSectionProps) {
  const result = useQuery(
    api.portalDefaults.listForPipelineFile,
    memberUserKey
      ? { pipelineFileId: fileId, memberUserKey }
      : { pipelineFileId: fileId },
  );

  const entries = result?.ok ? result.entries : [];
  const withDefaults = entries.filter((e) => e.assignedDefaults.length > 0);
  const missing = entries.filter((e) => e.missingSuggestedDefault);

  const summary =
    result === undefined
      ? "Loading…"
      : !result.ok
        ? result.message ?? "Unavailable"
        : entries.length === 0
          ? "No linked contacts"
          : `${withDefaults.length} with defaults · ${entries.length} contacts`;

  return (
    <CollapsibleBlock
      id="pipeline-contact-portal-defaults"
      title="Contact portal defaults"
      status={
        result === undefined
          ? "Loading"
          : !result.ok
            ? "Error"
            : withDefaults.length > 0
              ? "Ready"
              : "Needs setup"
      }
      summary={summary}
      icon={<Link2 className="h-4 w-4" aria-hidden />}
      indicatorCount={withDefaults.length || undefined}
      badgeVariant={
        missing.length > 0
          ? "warning"
          : withDefaults.length > 0
            ? "success"
            : "default"
      }
      headerRight={headerRight}
      lazyMount
      animated
      defaultOpen={false}
      description="Portals driven by defaults assigned on contacts linked to this file."
      contentClassName="space-y-3"
      className={className}
    >
      {result === undefined ? (
        <p className="text-sm text-muted-foreground">Loading contact portals…</p>
      ) : !result.ok ? (
        <p className="text-sm text-destructive" role="alert">
          {result.message ?? "Could not load portal defaults for this file."}
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-dlc-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          Link a contact to this file (borrower, lender rep, referrer, or deal
          partner), then assign a portal default on their contact record.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              key={String(entry.contactId)}
              className={cn(
                "rounded-dlc-md border border-border/80 bg-dlc-surface px-3 py-3",
              )}
              data-testid={`pipeline-contact-portal-entry-${entry.contactId}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {entry.contactName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.linkRole}
                    {entry.contactEmail ? ` · ${entry.contactEmail}` : ""}
                    {entry.suggestedPortalType
                      ? ` · Expected: ${PORTAL_DEFAULT_TYPE_LABELS[entry.suggestedPortalType as PortalDefaultType]}`
                      : ""}
                  </p>
                </div>
                <Link
                  href={`/contacts/${entry.contactId}`}
                  className="inline-flex min-h-10 shrink-0 items-center rounded-dlc-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary/35 hover:bg-muted"
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Contact
                </Link>
              </div>

              {entry.assignedDefaults.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {entry.assignedDefaults.map((d) => (
                    <li
                      key={String(d._id)}
                      className="rounded-dlc-sm bg-muted/40 px-2.5 py-2 text-xs"
                    >
                      <span className="font-medium text-foreground">
                        {PORTAL_DEFAULT_TYPE_LABELS[d.portalType]}: {d.name}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {d.sectionSummary ?? d.summary}
                        {d.config.welcomeMessage
                          ? ` · “${d.config.welcomeMessage.slice(0, 80)}${d.config.welcomeMessage.length > 80 ? "…" : ""}”`
                          : ""}
                      </span>
                      <Link
                        href={`/settings/portal-defaults/${d._id}/builder`}
                        className="mt-1 inline-block text-primary underline"
                      >
                        Open page builder
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                  No portal default assigned
                  {entry.suggestedPortalType
                    ? ` for ${PORTAL_DEFAULT_TYPE_LABELS[entry.suggestedPortalType]}`
                    : ""}
                  . Open the contact to pick a template from{" "}
                  <Link
                    href="/settings/portal-defaults"
                    className="underline"
                  >
                    Portal defaults
                  </Link>
                  .
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleBlock>
  );
}
