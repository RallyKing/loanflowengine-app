"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { Button } from "@/components/ui/Button";
import { FileWorkspaceContainer } from "@/components/pipeline/FileWorkspaceContainer";
import {
  SortableSectionItem,
  SortableSectionList,
} from "@/components/pipeline/workspace/SortableSectionList";
import { touchTargetIconClass } from "@/lib/ui/touchTarget";
import { cn } from "@/lib/cn";
import type { CollapsibleBlockBadgeVariant } from "@/lib/pipeline/collapsibleBlockMetadata";
import type { ClientWorkspaceTreeFile } from "@/lib/pipeline/clientWorkspaceTree";
import { projectWorkspaceTheme } from "@/lib/pipeline/projectWorkspaceTheme";

const DEFAULT_FILE_STATUS = "confirm_interest";

export type ProjectWorkspaceContainerProps = {
  containerId: string;
  projectId?: Id<"projects">;
  /** Synthetic bucket for files missing projectId — no project CRUD or create-under-project. */
  isUnassigned?: boolean;
  title: string;
  status: string;
  summary: string;
  files: ClientWorkspaceTreeFile[];
  badgeVariant?: CollapsibleBlockBadgeVariant;
  defaultOpen?: boolean;
  clientId?: Id<"clients">;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  sortDragHandle?: React.ReactNode;
};

/**
 * Phase 55.2 — Level 1 cascade: project (or unassigned) collapsible container.
 * Phase 55.3 — nests file containers with lazy-mounted workspaces.
 */
export function ProjectWorkspaceContainer({
  containerId,
  projectId,
  isUnassigned = false,
  title,
  status,
  summary,
  files,
  badgeVariant = "secondary",
  defaultOpen = false,
  clientId,
  organizationId,
  memberUserKey,
  sortDragHandle,
}: ProjectWorkspaceContainerProps) {
  const resolvedTitle = title.trim() || "Untitled Project";
  const canMutate = Boolean(organizationId && memberUserKey?.trim());
  const isThemedProject = !isUnassigned && Boolean(projectId);
  const theme = projectWorkspaceTheme;

  const createLoanFile = useMutation(
    api.pipelineHierarchyMutations.createLoanFileUnderProject,
  );
  const patchProject = useMutation(api.hierarchyCrudMutations.patchProject);
  const deleteProject = useMutation(api.hierarchyCrudMutations.deleteProject);
  const reorderProjectFiles = useMutation(
    api.pipelineClientWorkspaceMutations.reorderProjectFiles,
  );
  const [creating, setCreating] = useState(false);
  const [mutating, setMutating] = useState(false);

  const serverFileIds = useMemo(
    () => files.map((file) => String(file._id)),
    [files],
  );
  const serverFileIdsKey = serverFileIds.join("|");
  const [localFileIds, setLocalFileIds] = useState<string[]>([]);

  useEffect(() => {
    setLocalFileIds(serverFileIds);
  }, [serverFileIds, serverFileIdsKey]);

  const filesById = useMemo(
    () => new Map(files.map((file) => [String(file._id), file] as const)),
    [files],
  );

  const orderedFiles = useMemo(() => {
    if (localFileIds.length === 0) return files;
    const ordered = localFileIds
      .map((id) => filesById.get(id))
      .filter((file): file is ClientWorkspaceTreeFile => file != null);
    // Newly created files render immediately even before the local order
    // sync effect runs (no reload / no frame gap).
    const seen = new Set(localFileIds);
    for (const file of files) {
      if (!seen.has(String(file._id))) ordered.push(file);
    }
    return ordered;
  }, [files, filesById, localFileIds]);

  const onCreateFile = useCallback(async () => {
    if (!canMutate || !organizationId || !memberUserKey || !projectId) return;
    const prompted = window.prompt(
      "Loan file name",
      `${resolvedTitle} — New file`,
    );
    const fileName = prompted?.trim() || `${resolvedTitle} — New file`;
    setCreating(true);
    try {
      await createLoanFile({
        organizationId,
        memberUserKey,
        projectId,
        fileName,
        status: DEFAULT_FILE_STATUS,
        fundingAmount: 0,
        rate: 0,
        term: "",
        lenders: [],
        contacts: [],
      });
    } finally {
      setCreating(false);
    }
  }, [
    canMutate,
    createLoanFile,
    memberUserKey,
    organizationId,
    projectId,
    resolvedTitle,
  ]);

  const onRenameProject = useCallback(async () => {
    if (!canMutate || !organizationId || !memberUserKey || !projectId) return;
    const next = window.prompt("Rename project", resolvedTitle);
    const trimmed = next?.trim();
    if (!trimmed || trimmed === resolvedTitle) return;
    setMutating(true);
    try {
      await patchProject({
        organizationId,
        memberUserKey,
        projectId,
        title: trimmed,
      });
    } finally {
      setMutating(false);
    }
  }, [
    canMutate,
    memberUserKey,
    organizationId,
    patchProject,
    projectId,
    resolvedTitle,
  ]);

  const onDeleteProject = useCallback(async () => {
    if (!canMutate || !organizationId || !memberUserKey || !projectId) return;
    const cascadeMsg =
      files.length > 0
        ? `Delete "${resolvedTitle}" and all ${files.length} loan file${files.length === 1 ? "" : "s"}? This cannot be undone.`
        : `Delete "${resolvedTitle}"? This cannot be undone.`;
    if (!window.confirm(cascadeMsg)) return;
    setMutating(true);
    try {
      await deleteProject({
        organizationId,
        memberUserKey,
        projectId,
        forceCascade: files.length > 0 ? true : undefined,
      });
    } finally {
      setMutating(false);
    }
  }, [
    canMutate,
    deleteProject,
    files.length,
    memberUserKey,
    organizationId,
    projectId,
    resolvedTitle,
  ]);

  const onFileDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (isUnassigned || !projectId || !canMutate || !organizationId || !memberUserKey) {
        return;
      }
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = localFileIds.indexOf(String(active.id));
      const newIndex = localFileIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const next = arrayMove(localFileIds, oldIndex, newIndex);
      setLocalFileIds(next);
      try {
        await reorderProjectFiles({
          organizationId,
          memberUserKey,
          projectId,
          orderedFileIds: next as Id<"pipeline">[],
        });
      } catch {
        setLocalFileIds(serverFileIds);
      }
    },
    [
      canMutate,
      isUnassigned,
      localFileIds,
      memberUserKey,
      organizationId,
      projectId,
      reorderProjectFiles,
      serverFileIds,
    ],
  );

  const projectActionClass = cn(
    "h-8 w-8 shrink-0 p-0",
    touchTargetIconClass,
    isThemedProject && theme.accent,
  );

  const projectHeaderActions =
    !isUnassigned && projectId ? (
      <div
        className="inline-flex items-center gap-0.5"
        data-testid={`pipeline-client-project-actions-${containerId}`}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={projectActionClass}
          aria-label="Add loan file to project"
          disabled={creating || mutating || !canMutate}
          data-testid={`pipeline-client-project-add-file-${containerId}`}
          onClick={(e) => {
            e.stopPropagation();
            void onCreateFile();
          }}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={projectActionClass}
          aria-label="Rename project"
          disabled={mutating || !canMutate}
          data-testid={`pipeline-client-project-rename-${containerId}`}
          onClick={(e) => {
            e.stopPropagation();
            void onRenameProject();
          }}
        >
          <Pencil className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            projectActionClass,
            "text-destructive hover:text-destructive",
          )}
          aria-label="Delete project"
          disabled={mutating || !canMutate}
          data-testid={`pipeline-client-project-delete-${containerId}`}
          onClick={(e) => {
            e.stopPropagation();
            void onDeleteProject();
          }}
        >
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
      </div>
    ) : null;

  const fileList =
    orderedFiles.length === 0 ? (
      <div
        className="flex flex-col items-center gap-2 px-2 py-3 text-center"
        data-testid={`pipeline-client-project-empty-${containerId}`}
      >
        <p className="text-sm text-muted-foreground">
          {isUnassigned
            ? "No unassigned loan files"
            : "No active files in this project"}
        </p>
        {!isUnassigned && projectId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "gap-1.5",
              isThemedProject && cn(theme.border, theme.accent),
            )}
            disabled={creating || mutating || !canMutate}
            data-testid={`pipeline-client-project-create-file-${containerId}`}
            onClick={() => void onCreateFile()}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Create File
          </Button>
        ) : null}
      </div>
    ) : (
      <SortableSectionList
        itemIds={localFileIds}
        onDragEnd={onFileDragEnd}
        disabled={isUnassigned || !canMutate || orderedFiles.length < 2}
      >
        <div
          className="flex flex-col gap-1.5 p-1 sm:p-1.5"
          data-testid={`pipeline-client-project-files-${containerId}`}
        >
          {orderedFiles.map((file) => (
            <SortableSectionItem
              key={String(file._id)}
              id={String(file._id)}
              disabled={isUnassigned || !canMutate}
            >
              {(fileDragHandle) => (
                <FileWorkspaceContainer
                  file={file}
                  clientId={clientId}
                  defaultOpen={false}
                  organizationId={organizationId}
                  memberUserKey={memberUserKey}
                  sortDragHandle={fileDragHandle}
                />
              )}
            </SortableSectionItem>
          ))}
        </div>
      </SortableSectionList>
    );

  return (
    <div data-testid={`pipeline-client-project-container-${containerId}`}>
      <CollapsibleBlock
        id={`pipeline-client-project-${containerId}`}
        title={resolvedTitle}
        status={status}
        summary={summary}
        indicatorCount={files.length}
        badgeVariant={badgeVariant}
        icon={<FolderKanban className="h-4 w-4 shrink-0" aria-hidden />}
        defaultOpen={defaultOpen}
        headerLeading={
          sortDragHandle ? (
            <span
              className={cn(
                isThemedProject && "[&_button]:text-[#BE9F56]",
              )}
            >
              {sortDragHandle}
            </span>
          ) : undefined
        }
        headerRight={projectHeaderActions}
        animated
        lazyMount
        density="compact"
        detachable={false}
        clientAssignBlockId={false}
        contentClassName="p-0"
        chromeClassName={
          isThemedProject ? cn(theme.background, theme.border) : undefined
        }
        headerRowClassName={
          isThemedProject ? cn(theme.border, theme.headerHover) : undefined
        }
        titleClassName={isThemedProject ? theme.title : undefined}
        leadingIconWrapClassName={isThemedProject ? theme.iconWrap : undefined}
        chevronClassName={isThemedProject ? theme.accent : undefined}
      >
        {fileList}
      </CollapsibleBlock>
    </div>
  );
}
