"use client";

import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  HubTriageHighlightView,
  TaskRollupCountsView,
} from "@/lib/pipeline/hubTriageHighlight";
import { PipelineFileTasksPreview } from "@/components/pipeline/tasks/PipelineFileTasksPreview";
import { PipelineFileTasksModal } from "@/components/pipeline/tasks/PipelineFileTasksModal";

export type PipelineFileTasksCardControlProps = {
  pipelineFileId: Id<"pipeline">;
  fileName: string;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  canEdit?: boolean;
  highlight?: HubTriageHighlightView | null;
  counts?: TaskRollupCountsView | null;
  className?: string;
};

/**
 * Card-owned preview + modal host. Modal mounts only while open so hub rows
 * do not pay for OverlayShell/TaskDrawer trees when idle.
 */
export function PipelineFileTasksCardControl({
  pipelineFileId,
  fileName,
  organizationId,
  memberUserKey,
  canEdit = false,
  highlight,
  counts,
  className,
}: PipelineFileTasksCardControlProps) {
  const [open, setOpen] = useState(false);
  const orgReady = Boolean(organizationId && memberUserKey?.trim());

  return (
    <>
      <PipelineFileTasksPreview
        fileName={fileName}
        highlight={highlight}
        counts={counts}
        className={className}
        onOpen={() => {
          if (!orgReady) return;
          setOpen(true);
        }}
      />
      {open && organizationId && memberUserKey?.trim() ? (
        <PipelineFileTasksModal
          open={open}
          onClose={() => setOpen(false)}
          pipelineFileId={pipelineFileId}
          fileName={fileName}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          canEdit={canEdit}
        />
      ) : null}
    </>
  );
}
