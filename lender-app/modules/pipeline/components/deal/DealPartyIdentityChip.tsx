"use client";

import Link from "next/link";
import { Building2, ExternalLink, RefreshCw, UserCircle2, X } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { hubInitials } from "@/components/contacts/hub/hubDetailStyles";
import { contactHubHref, entityHubHref } from "@/lib/pipeline/dealPartyHubHref";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export type DealPartyIdentityChipProps = {
  displayName: string;
  roleLabel?: string;
  contactId?: Id<"contacts"> | null;
  entityId?: Id<"clients"> | null;
  entityMode?: boolean;
  onChangeLink?: () => void;
  onRemoveLink?: () => void;
  className?: string;
};

/** Compact identity card — left column of the integrated party panel. */
export function DealPartyIdentityChip({
  displayName,
  roleLabel,
  contactId,
  entityId,
  entityMode,
  onChangeLink,
  onRemoveLink,
  className,
}: DealPartyIdentityChipProps) {
  const name = displayName.trim() || "Unlinked";
  const hubHref = contactId
    ? contactHubHref(contactId)
    : entityId
      ? entityHubHref(entityId)
      : null;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-2 rounded-dlc-md border border-gray-100 bg-dlc-surface p-2.5 dark:border-gray-800",
        className,
      )}
      data-testid="deal-party-identity-chip"
    >
      <div className="flex items-start gap-2">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-dlc-md bg-primary/10 text-xs font-semibold text-primary"
          aria-hidden
        >
          {entityMode ? (
            <Building2 className="h-4 w-4" />
          ) : (
            hubInitials(name)
          )}
        </div>
        <div className="min-w-0 flex-1">
          {hubHref ? (
            <Link
              href={hubHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex max-w-full items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              <span className="truncate">{name}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          )}
          {roleLabel ? (
            <Badge variant="outline" className="mt-1 text-[10px]">
              {roleLabel}
            </Badge>
          ) : null}
        </div>
        {!hubHref && !entityMode ? (
          <UserCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
      </div>
      {onChangeLink || onRemoveLink ? (
        <div className="flex flex-col gap-1">
          {onChangeLink ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-full justify-start gap-1.5 px-1.5 text-xs"
              onClick={onChangeLink}
              data-testid="deal-party-change-link"
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              Change link
            </Button>
          ) : null}
          {onRemoveLink ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-full justify-start gap-1.5 px-1.5 text-xs text-muted-foreground hover:text-destructive"
              onClick={onRemoveLink}
              data-testid="deal-party-remove-link"
            >
              <X className="h-3 w-3" aria-hidden />
              Remove link
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
