"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  Copy,
  ExternalLink,
  LogOut,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { traceDeleteExecution } from "@/lib/ui/deleteExecutionTrace";
import { withOperationalTimeout } from "@/lib/ui/operationalAsync";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { convexClientErrorMessage } from "@/lib/ui/convexErrorMessage";
import {
  HubIconButton,
  HubModalShell,
} from "@/components/ui/hubRowActionPrimitives";
import { PipelineFileSharingSection } from "@/components/PipelineFileSharingSection";
import { cn } from "@/lib/cn";
import { hubLoanFileActionCapabilities } from "@/lib/pipeline/hubLoanFileActions";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";

function mutationErrorMessage(error: unknown): string {
  return convexClientErrorMessage(error);
}

export function HubHierarchyLoanRowActions({
  row,
  organizationId,
  memberUserKey,
  onOpen,
  onDuplicated,
  compactMobile = false,
}: {
  row: PipelineTablePreviewRow;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  onOpen: () => void;
  onDuplicated?: (fileId: Id<"pipeline">) => void;
  /**
   * Mobile hub cards: natural-width rail, hide redundant Open (title already opens).
   * Desktop keeps the fixed 9.25rem hover rail.
   */
  compactMobile?: boolean;
}) {
  const { confirm } = useOperationalConfirm();
  const caps = hubLoanFileActionCapabilities(row);
  const patchPipeline = useMutation(api.pipeline.patch);
  const deleteFile = useMutation(api.hierarchyCrudMutations.deletePipelineFile);
  const leaveShare = useMutation(api.pipelineFileShares.leaveShare);
  const createFileWithDeal = useMutation(api.pipeline.createFileWithDeal);

  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [name, setName] = useState(row.fileName);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSaveRename = async () => {
    const next = name.trim();
    if (!next || next === row.fileName) {
      setRenameOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchPipeline({
        id: row._id,
        fileName: next,
        preferencesAccountId: memberUserKey,
      });
      setRenameOpen(false);
    } catch (e) {
      setError(mutationErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const openLeaveShareConfirm = () => {
    void (async () => {
      await confirm({
        variant: "delete",
        title: "Leave shared loan file",
        entityName: row.fileName,
        impact:
          "You will lose access to this file. The owner and other collaborators keep their access.",
        confirmLabel: "Leave share",
        cascade: [
          {
            text: "This does not delete the owner’s loan file.",
          },
        ],
        testId: "hub-loan-leave-share-modal",
        onConfirm: async () => {
          const result = await withOperationalTimeout(
            leaveShare({
              fileId: row._id,
              memberUserKey,
            }),
            {
              timeoutMs: 25_000,
              message:
                "Leave is taking longer than expected. Check your connection, then try again.",
            },
          );
          if (!result.ok) {
            throw new Error(result.message);
          }
          showOperationalToast({
            title: "Left share",
            description: `“${row.fileName}” was removed from your pipeline.`,
            variant: "success",
          });
        },
      });
    })();
  };

  const openDeleteConfirm = () => {
    void (async () => {
      traceDeleteExecution("hub_loan_delete", "modal_open", { fileId: row._id });
      await confirm({
        variant: "delete",
        title: "Delete loan file",
        entityName: row.fileName,
        impact: "This permanently removes the loan file from your pipeline workspace.",
        preview: {
          hierarchy:
            row.clientDisplayName || row.projectDisplayTitle
              ? `${row.clientDisplayName || "Client"}${row.projectDisplayTitle ? ` → ${row.projectDisplayTitle}` : ""}`
              : undefined,
          rows: row.subjectAddressDisplay
            ? [{ label: "Subject", value: row.subjectAddressDisplay }]
            : undefined,
        },
        cascade: [
          {
            text: "Tasks and portal access scoped to this file may stop.",
          },
          {
            text: "Ledger and audit references may remain for compliance.",
          },
        ],
        testId: "hub-loan-delete-modal",
        onConfirm: async () => {
          traceDeleteExecution("hub_loan_delete", "mutation_start", { fileId: row._id });
          traceDeleteExecution("hub_loan_delete", "mutation_dispatched");
          const result = await withOperationalTimeout(
            deleteFile({
              organizationId,
              memberUserKey,
              fileId: row._id,
            }),
            {
              timeoutMs: 25_000,
              message:
                "Delete is taking longer than expected. Check your connection, then try again.",
            },
          );
          if (!result.ok) {
            traceDeleteExecution("hub_loan_delete", "timeout_triggered", {
              message: result.message,
            });
            throw new Error(result.message);
          }
          traceDeleteExecution("hub_loan_delete", "mutation_resolved");
          traceDeleteExecution("hub_loan_delete", "mutation_success");
          traceDeleteExecution("hub_loan_delete", "overlay_dismissed");
        },
      });
    })();
  };

  const onDuplicate = async () => {
    setDuplicating(true);
    setError(null);
    try {
      // Inherit hierarchy FKs from the source row so the copy binds to the
      // same client/project and renders in the client workspace instantly.
      const hasHierarchy = Boolean(row.clientId && row.projectId);
      const { id } = await createFileWithDeal({
        fileName: `${row.fileName.trim() || "Loan file"} (copy)`,
        status: row.status ?? "active",
        fundingAmount: row.fundingAmount ?? 0,
        rate: row.rate ?? 0,
        term: row.term ?? "",
        lenders: [],
        contacts: [],
        clientName: row.clientDisplayName?.trim() || "Borrower",
        projectName: row.projectDisplayTitle?.trim() || "Project",
        organizationId,
        preferencesAccountId: memberUserKey,
        ...(hasHierarchy
          ? { clientId: row.clientId, projectId: row.projectId }
          : { allowLegacyHierarchyBypass: true }),
      });
      onDuplicated?.(id);
    } catch (e) {
      setError(mutationErrorMessage(e));
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "hub-row-action-rail flex flex-none flex-nowrap items-center justify-end gap-0.5",
          compactMobile
            ? "w-auto min-w-0 max-w-none shrink-0 max-md:w-auto max-md:min-w-0 max-md:max-w-none md:w-[9.25rem] md:min-w-[9.25rem] md:max-w-[9.25rem] md:basis-[9.25rem]"
            : "w-[9.25rem] min-w-[9.25rem] max-w-[9.25rem] shrink-0 grow-0 basis-[9.25rem]",
          "opacity-100 md:opacity-0 md:transition-opacity md:group-hover/loan-row:opacity-100 md:focus-within:opacity-100",
        )}
        data-testid="hub-loan-row-actions"
        onClick={(e) => e.stopPropagation()}
      >
        {compactMobile ? (
          <span className="hidden md:contents">
            <HubIconButton
              testId="hub-loan-open"
              tooltip="Open loan file"
              onClick={() => onOpen()}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
            </HubIconButton>
          </span>
        ) : (
          <HubIconButton
            testId="hub-loan-open"
            tooltip="Open loan file"
            onClick={() => onOpen()}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
          </HubIconButton>
        )}
        <HubIconButton
          testId="hub-loan-edit"
          tooltip="Rename loan file"
          disabled={!caps.canEdit}
          onClick={() => {
            setName(row.fileName);
            setRenameOpen(true);
          }}
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </HubIconButton>
        <HubIconButton
          testId="hub-loan-duplicate"
          tooltip="Duplicate loan file"
          disabled={!caps.canDuplicate || duplicating}
          onClick={() => void onDuplicate()}
        >
          <Copy className="h-4 w-4" aria-hidden />
        </HubIconButton>
        <HubIconButton
          testId="hub-loan-share"
          tooltip={
            caps.canShare ? "Share loan file" : "Only the owner can share"
          }
          disabled={!caps.canShare}
          onClick={() => setShareOpen(true)}
        >
          <Share2 className="h-4 w-4" aria-hidden />
        </HubIconButton>
        {caps.canLeaveShare ? (
          <HubIconButton
            testId="hub-loan-leave-share"
            tooltip="Leave share"
            destructive
            onClick={openLeaveShareConfirm}
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </HubIconButton>
        ) : (
          <HubIconButton
            testId="hub-loan-delete"
            tooltip="Delete loan file"
            destructive
            disabled={!caps.canDelete}
            onClick={openDeleteConfirm}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </HubIconButton>
        )}
      </div>

      {renameOpen ? (
        <HubModalShell
          testId="hub-loan-rename-modal"
          title="Rename loan file"
          onClose={() => setRenameOpen(false)}
        >
          <label className="block text-xs text-muted-foreground">
            File name
            <Input
              className="mt-1 h-9"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={saving}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSaveRename();
              }}
            />
          </label>
          {error ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => setRenameOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving || !name.trim()}
              onClick={() => void onSaveRename()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </HubModalShell>
      ) : null}

      {shareOpen ? (
        <HubModalShell
          testId="hub-loan-share-modal"
          title="Share loan file"
          onClose={() => setShareOpen(false)}
        >
          <PipelineFileSharingSection
            fileId={row._id}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
          />
        </HubModalShell>
      ) : null}
    </>
  );
}
