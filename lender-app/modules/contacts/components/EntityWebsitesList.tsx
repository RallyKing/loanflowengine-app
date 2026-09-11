"use client";

import { ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  resolveEntityWebsites,
  websiteDisplayLabel,
  websiteHref,
  type EntityWebsite,
} from "@/lib/contacts/entityWebsites";

type EntityWebsitesListProps = {
  websites?: EntityWebsite[] | null;
  className?: string;
  /** Compact chip row (hub identity) vs stacked list. */
  variant?: "chips" | "list";
  emptyLabel?: string;
};

export function EntityWebsitesList({
  websites,
  className,
  variant = "list",
  emptyLabel,
}: EntityWebsitesListProps) {
  const entries = resolveEntityWebsites({ websites });
  if (entries.length === 0) {
    if (!emptyLabel) return null;
    return (
      <p className={cn("text-sm italic text-muted-foreground", className)}>
        {emptyLabel}
      </p>
    );
  }

  if (variant === "chips") {
    return (
      <ul
        className={cn("flex flex-wrap gap-2", className)}
        aria-label="Websites"
      >
        {entries.map((entry) => (
          <li key={websiteHref(entry.url)}>
            <a
              href={websiteHref(entry.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 rounded-dlc-sm border border-border/70 bg-dlc-surface-high px-2.5 py-1.5 text-dlc-label-md text-primary transition-colors duration-dlc-short hover:bg-muted/60"
              title={entry.url}
            >
              <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                {websiteDisplayLabel(entry)}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={cn("grid gap-1.5", className)} aria-label="Websites">
      {entries.map((entry) => (
        <li key={websiteHref(entry.url)}>
          <a
            href={websiteHref(entry.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-2 text-sm text-primary hover:underline"
            title={entry.url}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">
              {websiteDisplayLabel(entry)}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}
