"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FolderOpen } from "lucide-react";
import { LibraryDocumentsWorkspace } from "@/components/library/LibraryDocumentsWorkspace";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { cn } from "@/lib/cn";
import type { Id } from "@/convex/_generated/dataModel";
import { DOCUMENTS_TAB_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";
import type { DocumentVaultNavigationFocus } from "@/lib/pipeline/documentVaultNavigation";
import type { DocumentCreatorTokenContext } from "@/lib/pipeline/documentVaultCreator";
import { DocumentVaultStateProvider } from "@/lib/library/documentVaultState";
import { documentVaultBlockMeta } from "@/lib/pipeline/collapsibleBlockMetadata";

export type DocumentVaultTabProps = {
  fileId: Id<"pipeline">;
  /** Primary borrower CRM contact — vault hydrates global contact documents. */
  primaryBorrowerContactId?: Id<"contacts">;
  memberUserKey?: string;
  canUseHub: boolean;
  organizationId?: Id<"organizations">;
  /** Loan file label for Deal Bible export naming. */
  dealPackageLabel?: string;
  /** Live deal token values for the document creator. */
  documentCreatorTokenContext?: DocumentCreatorTokenContext;
  /** Cross-tab focus from Client Portal promote / view-in-documents. */
  navigationFocus?: DocumentVaultNavigationFocus | null;
  onNavigationFocusConsumed?: () => void;
  className?: string;
};

export function DocumentVaultTab({
  fileId,
  primaryBorrowerContactId: _primaryBorrowerContactId,
  memberUserKey,
  canUseHub,
  organizationId,
  dealPackageLabel,
  documentCreatorTokenContext,
  navigationFocus,
  onNavigationFocusConsumed,
  className,
}: DocumentVaultTabProps) {
  const listArgs = useMemo(() => {
    const base = {
      proof: { kind: "pipeline" as const, pipelineFileId: fileId },
      limit: 80 as const,
    };
    return memberUserKey ? { ...base, memberUserKey } : base;
  }, [fileId, memberUserKey]);

  const rows = useQuery(api.libraryDocuments.listForProof, listArgs);

  const lastUploadedAt = useMemo(() => {
    if (!rows?.length) return undefined;
    let max = 0;
    for (const row of rows) {
      const ts = row.latestUploadedAt ?? row.updatedAt;
      if (typeof ts === "number" && ts > max) max = ts;
    }
    return max > 0 ? max : undefined;
  }, [rows]);

  const vaultMeta = documentVaultBlockMeta(rows?.length, lastUploadedAt);

  return (
    <div
      className={cn("min-w-0 w-full", className)}
      data-testid="pipeline-documents-vault-tab"
      data-workspace-layout="constrained"
      data-primary-borrower-contact-id={_primaryBorrowerContactId ?? undefined}
    >
      <DocumentVaultStateProvider>
        <CollapsibleBlock
          id={DOCUMENTS_TAB_SECTION_IDS.vault}
          title="Document vault"
          status={vaultMeta.status}
          summary={vaultMeta.summary}
          indicatorCount={vaultMeta.indicatorCount}
          badgeVariant={vaultMeta.badgeVariant}
          icon={<FolderOpen className="h-4 w-4" aria-hidden />}
          description="Versioned files, directory tree, upload queue, and deal package compiler."
          defaultOpen
          lazyMount={false}
        >
          <LibraryDocumentsWorkspace
            layout="vault"
            context={{ kind: "pipeline", pipelineFileId: fileId }}
            memberUserKey={memberUserKey}
            canUseHub={canUseHub}
            actionTitle={(hint) => hint}
            dealPackageLabel={dealPackageLabel}
            organizationId={organizationId}
            documentCreatorTokenContext={documentCreatorTokenContext}
            navigationFocus={navigationFocus}
            onNavigationFocusConsumed={onNavigationFocusConsumed}
          />
        </CollapsibleBlock>
      </DocumentVaultStateProvider>
    </div>
  );
}
