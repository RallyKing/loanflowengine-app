"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AtomicPortalBlockList } from "@/components/library/AtomicPortalBlockRenderer";
import { isClientPortalAssignableBlock } from "@/lib/documentVaultClientBlocks";
import {
  ClientPortalBlockSessionProvider,
  useClientPortalBlockSession,
} from "@/lib/clientPortalDraftStore";
import { isAtomicPortalBlockId } from "@/lib/atomicPortalBlockRegistry";

export type ClientPortalBlockPanelProps = {
  bundleToken: string;
  fileTaskId: Id<"documentVaultFileTasks">;
  assignedBlocks: string[];
  disabled?: boolean;
  onSubmitted?: () => void;
};

function ClientPortalBlockPanelInner({
  bundleToken,
  fileTaskId,
  assignedBlocks,
  disabled = false,
  onSubmitted,
}: ClientPortalBlockPanelProps) {
  const session = useClientPortalBlockSession();
  const submitBlock = useMutation(
    api.documentVaultClientBundlePortal.submitClientBlockFromBundle,
  );

  const blocks = assignedBlocks.filter((id) => isClientPortalAssignableBlock(id));

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
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Forms to complete (in order)
      </p>
      <AtomicPortalBlockList
        blockIds={blocks}
        pipelineFileId={pipelineFileId}
        portalMode
        readOnly={disabled}
        useCollapsibleChrome
        defaultExpandedBlockId={blocks.find(isAtomicPortalBlockId)}
        renderHeaderRight={(blockId) => (
          <button
            type="button"
            className="rounded-dlc-sm bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground disabled:opacity-50"
            disabled={disabled || !session.canSubmitBlock(blockId)}
            data-testid={`client-portal-block-submit-${blockId}`}
            onClick={() => {
              const formData = session.extractFormData(blockId);
              void submitBlock({
                bundleToken,
                fileTaskId,
                blockId,
                formData: {
                  ...formData,
                  submittedAt: Date.now(),
                  blockId,
                },
              }).then(() => onSubmitted?.());
            }}
          >
            Submit
          </button>
        )}
      />
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
