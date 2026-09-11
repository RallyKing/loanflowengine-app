"use client";

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { AtomicPortalBlockList } from "@/components/library/AtomicPortalBlockRenderer";
import { DealWorkspaceEditorProvider } from "@/lib/file/useDealWorkspaceEditor";
import {
  assignedBlockIdsOrdered,
  resolveTaskType,
} from "@/lib/documentVaultTaskTypes";
import {
  getAtomicPortalBlock,
  isAtomicPortalBlockId,
  type AtomicPortalBlockId,
} from "@/lib/atomicPortalBlockRegistry";
import { cn } from "@/lib/cn";
import type { DocumentVaultFileTaskRow } from "@/components/library/FileTaskContainer";

export type FileTaskInlineBlockListProps = {
  fileTask: DocumentVaultFileTaskRow;
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  canMutate: boolean;
  depth?: number;
};

function blockCompletionLabel(blockId: AtomicPortalBlockId): string {
  const def = getAtomicPortalBlock(blockId);
  return def.defaultSummary?.trim() || "Assigned";
}

export function FileTaskInlineBlockList({
  fileTask,
  pipelineFileId,
  memberUserKey,
  canMutate,
  depth = 1,
}: FileTaskInlineBlockListProps) {
  const taskType = resolveTaskType(fileTask.taskType);
  const blockIds = useMemo(
    () => assignedBlockIdsOrdered(fileTask),
    [fileTask],
  );

  if (taskType !== "block_assignment" || blockIds.length === 0) {
    return null;
  }

  const indentPx = depth * 10 + 8;

  return (
    <li
      className="min-w-0 list-none"
      data-testid={`file-task-inline-blocks-${fileTask._id}`}
    >
      <div
        className="border-b border-border/40 bg-muted/5 px-2 py-0.5"
        style={{ paddingLeft: `${indentPx}px` }}
      >
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <LayoutGrid className="h-3 w-3 shrink-0" aria-hidden />
          Assigned blocks ({blockIds.length})
        </p>
      </div>
      <div
        className="min-w-0 max-w-full overflow-x-hidden border-b border-border/30"
        style={{ paddingLeft: `${indentPx}px` }}
      >
        <DealWorkspaceEditorProvider fileId={pipelineFileId}>
          <AtomicPortalBlockList
            blockIds={blockIds}
            pipelineFileId={pipelineFileId}
            memberUserKey={memberUserKey}
            readOnly={!canMutate}
            useCollapsibleChrome
            defaultExpandedBlockId={blockIds.find(isAtomicPortalBlockId)}
            renderHeaderLeading={(blockId) => (
              <LayoutGrid
                className="h-3 w-3 shrink-0 text-violet-600 dark:text-violet-400"
                aria-hidden
              />
            )}
            renderHeaderRight={(blockId) => (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                  "bg-muted/60 text-muted-foreground",
                )}
              >
                {blockCompletionLabel(blockId)}
              </span>
            )}
          />
        </DealWorkspaceEditorProvider>
      </div>
    </li>
  );
}
