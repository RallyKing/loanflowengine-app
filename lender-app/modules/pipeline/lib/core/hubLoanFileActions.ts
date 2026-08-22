import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";

export type HubLoanFileActionCapabilities = {
  canOpen: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Recipient with an explicit loan share can leave (Google Docs style). */
  canLeaveShare: boolean;
  canDuplicate: boolean;
  canShare: boolean;
};

/** UI-only ACL for hub inline loan file actions (Phase 15 Step 15). */
export function hubLoanFileActionCapabilities(
  row: PipelineTablePreviewRow,
): HubLoanFileActionCapabilities {
  const ownership = row.ownership;
  const isOwner = ownership?.isOwner === true;
  const sharedView =
    ownership?.badge === "shared_view" || ownership?.viewerAccessLevel === "view";
  const sharedEdit = ownership?.badge === "shared_edit";
  const isSharedRecipient =
    !isOwner &&
    (ownership?.isSharedViewer === true ||
      sharedView ||
      sharedEdit ||
      ownership?.hierarchyAccessLabel === "Explicit Loan Share");
  const canEditFile = row.canEditFile && !sharedView;

  return {
    canOpen: true,
    canEdit: canEditFile,
    canDelete: isOwner,
    canLeaveShare: isSharedRecipient,
    canDuplicate: canEditFile && isOwner,
    canShare: isOwner,
  };
}
