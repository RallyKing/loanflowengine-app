"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  settingsHref,
  type SettingsSectionId,
} from "@/lib/settingsRegistry";

type Props = {
  section?: SettingsSectionId;
  className?: string;
  children?: React.ReactNode;
  /** Icon-only affordance (still labeled for screen readers). */
  iconOnly?: boolean;
  /** Overrides default `aria-label` when `iconOnly`. */
  ariaLabel?: string;
};

/**
 * In-app link to the Settings hub, optionally focused on a section via URL hash.
 */
export function SettingsLink({
  section,
  className,
  children,
  iconOnly = false,
  ariaLabel,
}: Props) {
  const href = settingsHref(section);
  const defaultIconAria =
    section != null
      ? `Open settings: ${section.replace(/-/g, " ")}`
      : "Open settings";
  const label =
    children ??
    (section ? `Preferences — ${section}` : "Preferences");

  if (iconOnly) {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground",
          className
        )}
        title={typeof label === "string" ? label : "Preferences"}
        aria-label={ariaLabel ?? defaultIconAria}
      >
        <Settings className="h-4 w-4 shrink-0" aria-hidden />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline",
        className
      )}
    >
      <Settings className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
      {label}
    </Link>
  );
}
