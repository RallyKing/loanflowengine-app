"use client";

import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DocumentExpiryStatus } from "@/lib/library/documentVaultExpiry";
import { daysUntilExpiry } from "@/lib/library/documentVaultExpiry";

export type DocumentVaultExpiryBadgeProps = {
  status: DocumentExpiryStatus;
  expiresAt?: number;
  className?: string;
};

export function DocumentVaultExpiryBadge({
  status,
  expiresAt,
  className,
}: DocumentVaultExpiryBadgeProps) {
  if (status === "none" || status === "active") return null;

  const remaining = daysUntilExpiry(expiresAt);
  const isExpired = status === "expired";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        isExpired
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        className,
      )}
      data-testid={
        isExpired ? "document-vault-expiry-expired" : "document-vault-expiry-soon"
      }
      title={
        isExpired
          ? "This document has expired and may need a fresh upload."
          : `Expires in ${remaining ?? "?"} day(s).`
      }
    >
      {isExpired ? (
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      ) : (
        <Clock className="h-3 w-3 shrink-0" aria-hidden />
      )}
      {isExpired ? "Expired" : "Expiring soon"}
    </span>
  );
}
