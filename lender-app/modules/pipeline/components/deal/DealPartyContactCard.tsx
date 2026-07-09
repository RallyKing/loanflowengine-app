"use client";

import Link from "next/link";
import { ExternalLink, Mail, Phone, UserCircle2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { hubDetailStyles, hubInitials } from "@/components/contacts/hub/hubDetailStyles";
import { contactHubHref, entityHubHref } from "@/lib/pipeline/dealPartyHubHref";
import { Badge } from "@/components/ui/Badge";

export type DealPartyContactCardProps = {
  title: string;
  subtitle?: string;
  name: string;
  roleLabel?: string;
  email?: string;
  phone?: string;
  fico?: string;
  contactId?: Id<"contacts"> | null;
  entityId?: Id<"clients"> | null;
  className?: string;
};

export function DealPartyContactCard({
  title,
  subtitle,
  name,
  roleLabel,
  email,
  phone,
  fico,
  contactId,
  entityId,
  className,
}: DealPartyContactCardProps) {
  const displayName = name.trim() || "Unnamed party";
  const hubHref = contactId
    ? contactHubHref(contactId)
    : entityId
      ? entityHubHref(entityId)
      : null;

  return (
    <article
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800",
        "transition-shadow duration-dlc-short ease-dlc-standard hover:shadow-md",
        className,
      )}
      data-testid="deal-party-contact-card"
    >
      <div className="flex items-start gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div className={cn(hubDetailStyles.avatar, "h-12 w-12 text-base")} aria-hidden>
          {hubInitials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </p>
          {hubHref ? (
            <Link
              href={hubHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-0.5 inline-flex max-w-full items-center gap-1.5 text-dlc-title-md font-semibold text-primary hover:underline"
            >
              <span className="truncate">{displayName}</span>
              <ExternalLink
                className="h-4 w-4 shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
              <span className="sr-only">Open CRM hub in new tab</span>
            </Link>
          ) : (
            <p className="mt-0.5 truncate text-dlc-title-md font-semibold text-foreground">
              {displayName}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {roleLabel ? <Badge variant="outline">{roleLabel}</Badge> : null}
            {fico?.trim() ? (
              <span className="text-dlc-body-sm text-muted-foreground">
                FICO <span className="font-semibold text-foreground">{fico.trim()}</span>
              </span>
            ) : null}
          </div>
          {subtitle ? (
            <p className="mt-1 text-dlc-body-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {!hubHref ? (
          <UserCircle2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
      </div>
      {email?.trim() || phone?.trim() ? (
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          {email?.trim() ? (
            <a href={`mailto:${email.trim()}`} className={hubDetailStyles.contactChip}>
              <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <p className={hubDetailStyles.label}>Email</p>
                <p className={cn(hubDetailStyles.value, "truncate")}>{email.trim()}</p>
              </div>
            </a>
          ) : null}
          {phone?.trim() ? (
            <a href={`tel:${phone.trim()}`} className={hubDetailStyles.contactChip}>
              <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <p className={hubDetailStyles.label}>Phone</p>
                <p className={hubDetailStyles.value}>{phone.trim()}</p>
              </div>
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
