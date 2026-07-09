"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { settingsHref } from "@/lib/settingsRegistry";

type Variant = "files" | "members" | "feature";

const TITLES: Record<Variant, string> = {
  files: "File limit reached",
  members: "Member limit reached",
  feature: "Plan required",
};

export function PlanLimitUpgradeBanner({
  variant,
  message,
  className,
  children,
}: {
  variant: Variant;
  /** Optional custom body; defaults to action-oriented copy. */
  message?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const body =
    message ??
    (variant === "feature"
      ? "This action isn’t included on your current plan."
      : "Free up space or upgrade to continue.");

  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-50",
        className,
      )}
    >
      <p className="font-medium text-foreground">{TITLES[variant]}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      {children}
      <p className="mt-2 text-xs">
        <Link
          href={settingsHref("billing")}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Open Team billing
        </Link>{" "}
        to upgrade.
      </p>
    </div>
  );
}
