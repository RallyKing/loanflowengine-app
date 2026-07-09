"use client";

import type { LucideIcon } from "lucide-react";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";
import { cn } from "@/lib/cn";

export type HubTabPlaceholderProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  className?: string;
};

export function HubTabPlaceholder({
  title,
  description,
  icon: Icon,
  className,
}: HubTabPlaceholderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-dlc-xl border border-dashed border-border/80 bg-muted/20 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-dlc-xl bg-primary/10 ring-1 ring-primary/20">
        <Icon className="h-7 w-7 text-primary" aria-hidden />
      </div>
      <h3 className={cn(hubDetailStyles.sectionTitle, "mt-6")}>{title}</h3>
      <p className="mt-2 max-w-md text-dlc-body-sm text-muted-foreground">
        {description}
      </p>
      <p className="mt-4 text-dlc-label-md font-medium text-primary/80">
        Coming in the next release
      </p>
    </div>
  );
}
