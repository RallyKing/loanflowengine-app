"use client";

import { Input } from "@/components/ui/Input";
import { FileTaskAtomicBlockBuilder } from "@/components/library/FileTaskAtomicBlockBuilder";
import { FileTaskClientTemplateAttach } from "@/components/library/FileTaskClientTemplateAttach";
import { RelativeDueOffsetInput } from "@/components/library/RelativeDueOffsetInput";
import { TaskTemplateFolderEditor } from "@/components/library/TaskTemplateFolderEditor";
import {
  FILE_TASK_PRIORITIES,
  FILE_TASK_PRIORITY_LABELS,
  FILE_TASK_TYPE_DESCRIPTIONS,
  FILE_TASK_TYPE_LABELS,
  FILE_TASK_TYPES,
  type AssignedBlockEntry,
  type FileTaskPriority,
  type FileTaskType,
} from "@/lib/documentVaultTaskTypes";
import type { FileTaskClientTemplateAttachment } from "@/lib/fileTaskClientTemplates";
import { taskTypeAllowsClientTemplates } from "@/lib/fileTaskClientTemplates";
import type { FolderTemplateNode } from "@/lib/library/folderTemplateTypes";
import { cn } from "@/lib/cn";
import type { Id } from "@/convex/_generated/dataModel";

export type FileTaskTypeConfiguratorProps = {
  title: string;
  onTitleChange: (value: string) => void;
  taskType: FileTaskType;
  onTaskTypeChange: (type: FileTaskType) => void;
  clientInstructionText: string;
  onClientInstructionTextChange: (value: string) => void;
  assignedBlockEntries: AssignedBlockEntry[];
  onAssignedBlockEntriesChange: (entries: AssignedBlockEntry[]) => void;
  folderTemplateNodes?: FolderTemplateNode[];
  onFolderTemplateNodesChange?: (nodes: FolderTemplateNode[]) => void;
  pipelineFileId?: Id<"pipeline">;
  /** Org Manage Templates — enables client template upload without a pipeline file. */
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  clientTemplateAttachments?: FileTaskClientTemplateAttachment[];
  onClientTemplateAttachmentsChange?: (
    next: FileTaskClientTemplateAttachment[],
  ) => void;
  isRequired?: boolean;
  onRequiredChange?: (value: boolean) => void;
  isPortalVisible?: boolean;
  onPortalVisibleChange?: (value: boolean) => void;
  description?: string;
  onDescriptionChange?: (value: string) => void;
  instructionUrl?: string;
  onInstructionUrlChange?: (value: string) => void;
  priority?: FileTaskPriority | "";
  onPriorityChange?: (value: FileTaskPriority | "") => void;
  dueOffsetDays?: number | null;
  onDueOffsetDaysChange?: (value: number | null) => void;
  /** `full` mirrors the live FileTaskConfigModal layout for template parity. */
  variant?: "compact" | "full";
  disabled?: boolean;
  showTitle?: boolean;
  compact?: boolean;
};

export function FileTaskTypeConfigurator({
  title,
  onTitleChange,
  taskType,
  onTaskTypeChange,
  clientInstructionText,
  onClientInstructionTextChange,
  assignedBlockEntries,
  onAssignedBlockEntriesChange,
  folderTemplateNodes = [],
  onFolderTemplateNodesChange,
  pipelineFileId,
  organizationId,
  memberUserKey,
  clientTemplateAttachments = [],
  onClientTemplateAttachmentsChange,
  isRequired = true,
  onRequiredChange,
  isPortalVisible = true,
  onPortalVisibleChange,
  description = "",
  onDescriptionChange,
  instructionUrl = "",
  onInstructionUrlChange,
  priority = "",
  onPriorityChange,
  dueOffsetDays = null,
  onDueOffsetDaysChange,
  variant = "compact",
  disabled = false,
  showTitle = true,
  compact = false,
}: FileTaskTypeConfiguratorProps) {
  const isFull = variant === "full";
  const visibilityLocked = taskType === "internal_task";
  const showClientTemplates =
    Boolean(onClientTemplateAttachmentsChange) &&
    taskTypeAllowsClientTemplates(taskType) &&
    Boolean(pipelineFileId || organizationId);

  const clientTemplateAttach = showClientTemplates ? (
    <FileTaskClientTemplateAttach
      pipelineFileId={pipelineFileId}
      organizationId={organizationId}
      memberUserKey={memberUserKey}
      value={clientTemplateAttachments}
      onChange={onClientTemplateAttachmentsChange!}
      disabled={disabled}
    />
  ) : null;

  if (isFull) {
    return (
      <div className="space-y-4">
        {showTitle ? (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Title
            </label>
            <Input
              className="mt-1"
              placeholder="e.g. 6 months bank statements"
              value={title}
              disabled={disabled}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </div>
        ) : null}

        {onDescriptionChange ? (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </label>
            <textarea
              className="mt-1 min-h-[3.5rem] w-full rounded-dlc-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Optional notes for your team or the client"
              value={description}
              disabled={disabled}
              onChange={(e) => onDescriptionChange(e.target.value)}
            />
          </div>
        ) : null}

        {onDueOffsetDaysChange || onPriorityChange ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {onDueOffsetDaysChange ? (
              <RelativeDueOffsetInput
                value={dueOffsetDays}
                onChange={onDueOffsetDaysChange}
                disabled={disabled}
              />
            ) : null}
            {onPriorityChange ? (
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Priority
                </label>
                <select
                  className="mt-1 h-9 w-full rounded-dlc-md border border-border bg-background px-3 text-sm"
                  value={priority}
                  disabled={disabled}
                  onChange={(e) =>
                    onPriorityChange(e.target.value as FileTaskPriority | "")
                  }
                >
                  <option value="">None</option>
                  {FILE_TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {FILE_TASK_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}

        {onRequiredChange || onPortalVisibleChange ? (
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {onRequiredChange ? (
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={isRequired}
                  disabled={disabled}
                  onChange={(e) => onRequiredChange(e.target.checked)}
                />
                Required
              </label>
            ) : null}
            {onPortalVisibleChange ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Visibility
                </span>
                <button
                  type="button"
                  disabled={disabled || visibilityLocked}
                  className={cn(
                    "rounded-dlc-sm px-2 py-1 text-xs font-medium transition-colors",
                    !isPortalVisible
                      ? "bg-primary/10 text-primary"
                      : "bg-muted/50 text-muted-foreground",
                    visibilityLocked && "opacity-60",
                  )}
                  onClick={() => onPortalVisibleChange(false)}
                >
                  Internal
                </button>
                <button
                  type="button"
                  disabled={disabled || visibilityLocked}
                  className={cn(
                    "rounded-dlc-sm px-2 py-1 text-xs font-medium transition-colors",
                    isPortalVisible
                      ? "bg-primary/10 text-primary"
                      : "bg-muted/50 text-muted-foreground",
                    visibilityLocked && "opacity-60",
                  )}
                  onClick={() => onPortalVisibleChange(true)}
                >
                  Client
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Task type
          </p>
          <div
            className="mt-2 flex gap-0.5 overflow-x-auto rounded-dlc-md border border-border/70 bg-muted/30 p-0.5"
            role="tablist"
          >
            {FILE_TASK_TYPES.map((type) => {
              const selected = taskType === type;
              return (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  disabled={disabled}
                  className={cn(
                    "shrink-0 rounded-dlc-sm px-3 py-1.5 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard",
                    selected
                      ? "bg-background text-foreground shadow-dlc-1"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => onTaskTypeChange(type)}
                >
                  {FILE_TASK_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-dlc-md border border-border/60 bg-dlc-surface p-3">
          {taskType === "document_upload" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {FILE_TASK_TYPE_DESCRIPTIONS.document_upload}
              </p>
              {onFolderTemplateNodesChange ? (
                <TaskTemplateFolderEditor
                  value={folderTemplateNodes}
                  onChange={onFolderTemplateNodesChange}
                  disabled={disabled}
                />
              ) : null}
              {clientTemplateAttach}
            </div>
          ) : null}

          {taskType === "internal_task" ? (
            <p className="text-xs text-muted-foreground">
              {FILE_TASK_TYPE_DESCRIPTIONS.internal_task} Visibility is locked
              to Internal.
            </p>
          ) : null}

          {taskType === "client_instruction" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {FILE_TASK_TYPE_DESCRIPTIONS.client_instruction}
              </p>
              {onInstructionUrlChange ? (
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Website link
                  </label>
                  <Input
                    className="mt-1"
                    type="text"
                    inputMode="url"
                    placeholder="https://payment-portal.example.com"
                    value={instructionUrl}
                    disabled={disabled}
                    onChange={(e) => onInstructionUrlChange(e.target.value)}
                  />
                </div>
              ) : null}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Instruction text
                </label>
                <textarea
                  className="mt-1 min-h-[6rem] w-full rounded-dlc-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="e.g. Visit the appraisal payment portal and pay the $450 fee before Friday."
                  value={clientInstructionText}
                  disabled={disabled}
                  onChange={(e) => onClientInstructionTextChange(e.target.value)}
                />
              </div>
              {clientTemplateAttach}
            </div>
          ) : null}

          {taskType === "block_assignment" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {FILE_TASK_TYPE_DESCRIPTIONS.block_assignment}
              </p>
              <FileTaskAtomicBlockBuilder
                value={assignedBlockEntries}
                onChange={onAssignedBlockEntriesChange}
                pipelineFileId={pipelineFileId}
                memberUserKey={memberUserKey}
                disabled={disabled}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {showTitle ? (
        <Input
          placeholder="Task title"
          value={title}
          disabled={disabled}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      ) : null}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Task type
        </p>
        <div
          className={cn(
            "mt-1.5 grid gap-1.5",
            compact ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {FILE_TASK_TYPES.map((type) => {
            const selected = taskType === type;
            return (
              <button
                key={type}
                type="button"
                disabled={disabled}
                className={cn(
                  "rounded-dlc-md border px-2.5 py-2 text-left transition-colors duration-dlc-short ease-dlc-standard",
                  selected
                    ? "border-primary bg-primary/5 shadow-dlc-1"
                    : "border-border/70 hover:border-primary/40",
                  disabled && "opacity-50",
                )}
                onClick={() => onTaskTypeChange(type)}
              >
                <p className="text-xs font-medium text-foreground">
                  {FILE_TASK_TYPE_LABELS[type]}
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                  {FILE_TASK_TYPE_DESCRIPTIONS[type]}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {taskType === "client_instruction" ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Client instruction
          </p>
          <textarea
            className="mt-1.5 min-h-[6rem] w-full rounded-dlc-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="e.g. Visit the appraisal payment portal and pay the $450 fee before Friday."
            value={clientInstructionText}
            disabled={disabled}
            onChange={(e) => onClientInstructionTextChange(e.target.value)}
          />
        </div>
      ) : null}

      {taskType === "block_assignment" ? (
        <FileTaskAtomicBlockBuilder
          value={assignedBlockEntries}
          onChange={onAssignedBlockEntriesChange}
          pipelineFileId={pipelineFileId}
          memberUserKey={memberUserKey}
          disabled={disabled}
        />
      ) : null}

      {taskType === "document_upload" && onFolderTemplateNodesChange ? (
        <TaskTemplateFolderEditor
          value={folderTemplateNodes}
          onChange={onFolderTemplateNodesChange}
          disabled={disabled}
        />
      ) : null}

      {onRequiredChange || onPortalVisibleChange ? (
        <div className="flex flex-wrap gap-3 text-xs">
          {onRequiredChange ? (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={isRequired}
                disabled={disabled}
                onChange={(e) => onRequiredChange(e.target.checked)}
              />
              Required
            </label>
          ) : null}
          {onPortalVisibleChange && taskType !== "internal_task" ? (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={isPortalVisible}
                disabled={disabled}
                onChange={(e) => onPortalVisibleChange(e.target.checked)}
              />
              Portal visible
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
