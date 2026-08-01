"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { kindLabel } from "@/lib/pipelineFileActivityModel";
import { Shield } from "lucide-react";
import { TrustListSkeleton } from "@/components/trust/TrustSurfaces";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import {
  pipelineWorkspaceNestedChipClass,
} from "@/lib/pipelineWorkspaceCard";

const VAULT_AUDIT_KINDS = new Set([
  "vault_client_upload",
  "vault_broker_review",
  "lender_delivery_accessed",
  "lender_document_previewed",
  "lender_folder_expanded",
  "lender_package_exported",
]);

function formatWhen(at: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(at));
  } catch {
    return new Date(at).toLocaleString();
  }
}

export function DocumentVaultAuditPanel({
  fileId,
}: {
  fileId: Id<"pipeline">;
}) {
  const { accountId } = useUserPreferences();
  const memberUserKey = accountId.trim() || undefined;
  const rows = useQuery(
    api.pipelineFileActivity.listForFile,
    memberUserKey
      ? { fileId, limit: 200, memberUserKey }
      : { fileId, limit: 200 },
  );

  const vaultRows = useMemo(() => {
    if (!rows) return undefined;
    return rows.filter((r) => VAULT_AUDIT_KINDS.has(r.kind));
  }, [rows]);

  const subtitle = useMemo(() => {
    if (vaultRows === undefined) return null;
    if (vaultRows.length === 0) {
      return "No vault or portal activity recorded yet.";
    }
    return `${vaultRows.length} compliance event${vaultRows.length === 1 ? "" : "s"} (newest first).`;
  }, [vaultRows]);

  return (
    <div data-testid="document-vault-audit-panel">
      <p className="mb-3 flex items-start gap-2 text-[11px] leading-snug text-muted-foreground">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Immutable audit trail for client uploads, broker reviews, lender data
        room access, and granular document engagement. Read-only — events cannot
        be edited or removed here.
      </p>
      {vaultRows === undefined ? (
        <TrustListSkeleton rows={4} label="Loading vault audit trail" />
      ) : (
        <>
          {subtitle ? (
            <p className="mb-2 text-[11px] text-muted-foreground">{subtitle}</p>
          ) : null}
          <ul
            data-nested-scroll
            className="max-h-64 touch-scroll-y space-y-2 overflow-y-auto overscroll-contain pr-1 text-xs"
          >
            {vaultRows.map((r) => (
              <li
                key={r._id}
                className={cn(
                  pipelineWorkspaceNestedChipClass,
                  "bg-background/80 px-2 py-1.5",
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="font-medium text-foreground">
                    {kindLabel(r.kind)}
                  </span>
                  <time
                    className="text-[11px] tabular-nums text-muted-foreground"
                    dateTime={new Date(r.at).toISOString()}
                  >
                    {formatWhen(r.at)}
                  </time>
                </div>
                {r.summary ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {r.summary}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
