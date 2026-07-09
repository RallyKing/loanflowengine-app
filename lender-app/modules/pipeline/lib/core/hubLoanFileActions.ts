import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";

export type HubLoanFileActionCapabilities = {
  canOpen: boolean;
  canEdit: boolean;
  canDelete: boolean;
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
  const canEditFile = row.canEditFile && !sharedView;

  return {
    canOpen: true,
    canEdit: canEditFile,
    canDelete: isOwner,
    canDuplicate: canEditFile && isOwner,
    canShare: isOwner,
  };
}
