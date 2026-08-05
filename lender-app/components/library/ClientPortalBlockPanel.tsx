"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AtomicPortalBlockList } from "@/components/library/AtomicPortalBlockRenderer";
import { isClientPortalAssignableBlock } from "@/lib/documentVaultClientBlocks";
import {
  ClientPortalBlockSessionProvider,
  useClientPortalBlockSession,
} from "@/lib/clientPortalDraftStore";
import { isAtomicPortalBlockId } from "@/lib/atomicPortalBlockRegistry";
import {
  clientBlockAssignmentAllowsEdit,
  clientBlockFormFieldsReadOnly,
  type VaultFileTaskStatus,
} from "@/lib/clientPortalBlockAssignmentStatus";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { readPortalAccessProof } from "@/lib/portalAccessProof";

export type ClientPortalBlockPanelProps = {
  bundleToken: string;
  fileTaskId: Id<"documentVaultFileTasks">;
  assignedBlocks: string[];
  /** Vault task status — drives draft vs submitted vs locked. */
  taskStatus?: VaultFileTaskStatus;
  /** Force-disable (broker preview / portal read-only). */
  disabled?: boolean;
  onSubmitted?: () => void;
};

function ClientPortalBlockPanelInner({
  bundleToken,
  fileTaskId,
  assignedBlocks,
  taskStatus = "incomplete",
  disabled = false,
  onSubmitted,
}: ClientPortalBlockPanelProps) {
  const session = useClientPortalBlockSession();
  const submitBlock = useMutation(
    api.documentVaultClientBundlePortal.submitClientBlockFromBundle,
  );
  const [revising, setRevising] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (taskStatus === "incomplete" || taskStatus === "complete") {
      setRevising(false);
    }
  }, [taskStatus]);

  const blocks = assignedBlocks.filter((id) => isClientPortalAssignableBlock(id));
  const allowsEdit = clientBlockAssignmentAllowsEdit(taskStatus) && !disabled;
  const fieldsReadOnly = clientBlockFormFieldsReadOnly({
    taskStatus,
    revising,
    forceDisabled: disabled || !allowsEdit,
  });
  const showSubmittedConfirm =
    taskStatus === "pending_review" && !revising && !disabled;
  const showRevise =
    taskStatus === "pending_review" && !revising && allowsEdit;
  const showSubmit = allowsEdit && !fieldsReadOnly;

  if (blocks.length === 0) return null;

  if (session.status === "loading") {
    return (
      <p className="mt-4 text-xs text-muted-foreground" data-testid="client-portal-blocks-loading">
        Loading forms…
      </p>
    );
  }

  if (session.status === "error") {
    return (
      <p
        className="mt-4 text-xs text-red-700"
        data-testid="client-portal-blocks-error"
        role="alert"
      >
        {session.errorMessage ?? "Unable to load forms."}
      </p>
    );
  }

  if (!session.portalEditorFileId) {
    return (
      <p className="mt-4 text-xs text-muted-foreground" data-testid="client-portal-blocks-loading">
        Loading forms…
      </p>
    );
  }

  const pipelineFileId = session.portalEditorFileId;

  return (
    <div
      className="mt-4 space-y-3 border-t border-border/50 pt-4"
      data-testid="client-portal-block-panel"
      data-assignment-phase={
        taskStatus === "complete"
          ? "complete"
          : taskStatus === "pending_review"
            ? "submitted"
            : "draft"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Forms to complete (in order)
        </p>
        {session.autosaveStatus !== "idle" && !fieldsReadOnly ? (
          <p
            className="text-[10px] text-muted-foreground"
            data-testid="client-portal-block-autosave"
            aria-live="polite"
          >
            {session.autosaveStatus === "saving" ? "Saving…" : "Saving soon…"}
          </p>
        ) : null}
      </div>

      {showSubmittedConfirm ? (
        <div
          className="rounded-dlc-md border border-emerald-200/90 bg-emerald-50 px-3 py-2.5"
          role="status"
          data-testid="client-portal-block-submitted"
        >
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-900">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Submitted — your broker can review this form.
          </p>
          <p className="mt-1 text-[11px] text-emerald-800">
            You can revise until your broker marks this request complete.
          </p>
        </div>
      ) : null}

      {showRevise ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full sm:w-auto"
          data-testid="client-portal-block-revise"
          onClick={() => {
            setSubmitError(null);
            setRevising(true);
          }}
        >
          Revise
        </Button>
      ) : null}

      <AtomicPortalBlockList
        blockIds={blocks}
        pipelineFileId={pipelineFileId}
        portalMode
        readOnly={fieldsReadOnly}
        useCollapsibleChrome
        defaultExpandedBlockId={blocks.find(isAtomicPortalBlockId)}
        renderHeaderRight={(blockId) =>
          showSubmit ? (
            <button
              type="button"
              className={cn(
                "rounded-dlc-sm bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground disabled:opacity-50",
              )}
              disabled={submitBusy || !session.canSubmitBlock(blockId)}
              data-testid={`client-portal-block-submit-${blockId}`}
              onClick={() => {
                const formData = session.extractFormData(blockId);
                setSubmitBusy(true);
                setSubmitError(null);
                void submitBlock({
                  bundleToken,
                  fileTaskId,
                  blockId,
                  formData: {
                    ...formData,
                    submittedAt: Date.now(),
                    blockId,
                  },
                  accessProof: readPortalAccessProof(bundleToken),
                })
                  .then(() => {
                    setRevising(false);
                    onSubmitted?.();
                  })
                  .catch((e) => {
                    setSubmitError(
                      e instanceof Error ? e.message : "Submit failed. Try again.",
                    );
                  })
                  .finally(() => setSubmitBusy(false));
              }}
            >
              {submitBusy ? "Submitting…" : "Submit"}
            </button>
          ) : null
        }
      />

      {submitError ? (
        <p className="text-xs text-red-600" role="alert">
          {submitError}
        </p>
      ) : null}
    </div>
  );
}

export function ClientPortalBlockPanel(props: ClientPortalBlockPanelProps) {
  return (
    <ClientPortalBlockSessionProvider
      bundleToken={props.bundleToken}
      fileTaskId={props.fileTaskId}
    >
      <ClientPortalBlockPanelInner {...props} />
    </ClientPortalBlockSessionProvider>
  );
}
