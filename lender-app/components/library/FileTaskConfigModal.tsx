"use client";

import { useEffect, useState } from "react";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FileTaskAtomicBlockBuilder } from "@/components/library/FileTaskAtomicBlockBuilder";
import {
  defaultPortalVisibleForTaskType,
  FILE_TASK_PRIORITIES,
  FILE_TASK_PRIORITY_LABELS,
  FILE_TASK_TYPE_DESCRIPTIONS,
  FILE_TASK_TYPE_LABELS,
  FILE_TASK_TYPES,
  validateTaskTypeConfig,
  type AssignedBlockEntry,
  type FileTaskPriority,
  type FileTaskType,
} from "@/lib/documentVaultTaskTypes";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import type { DocumentVaultFileTaskRow } from "@/components/library/FileTaskContainer";
import type { Id } from "@/convex/_generated/dataModel";
import { FileTaskClientTemplateAttach } from "@/components/library/FileTaskClientTemplateAttach";
import {
  taskTypeAllowsClientTemplates,
  type FileTaskClientTemplateAttachment,
} from "@/lib/fileTaskClientTemplates";

export type FileTaskConfigPayload = {
  title: string;
  description?: string;
  taskType: FileTaskType;
  clientInstructionText?: string;
  instructionUrl?: string;
  assignedBlockEntries?: AssignedBlockEntry[];
  clientTemplateAttachments?: FileTaskClientTemplateAttachment[];
  isRequired: boolean;
  isPortalVisible: boolean;
  dueDate?: number;
  priority?: FileTaskPriority;
};

export type FileTaskConfigModalProps = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initialTask?: DocumentVaultFileTaskRow;
  pipelineFileId?: Id<"pipeline">;
  memberUserKey?: string;
  onSubmit: (payload: FileTaskConfigPayload) => Promise<void>;
};

function toDateInputValue(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Date.parse(`${trimmed}T12:00:00`);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildInitialState(task?: DocumentVaultFileTaskRow) {
  const taskType = (task?.taskType ?? "document_upload") as FileTaskType;
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    taskType,
    instruction: task?.clientInstructionText ?? "",
    instructionUrl: task?.instructionUrl ?? "",
    blocks: task
      ? (task.assignedBlockEntries ?? []).length > 0
        ? [...(task.assignedBlockEntries ?? [])].sort(
            (a, b) => a.sortOrder - b.sortOrder,
          )
        : (task.assignedBlocks ?? []).map((blockId, index) => ({
            blockId,
            sortOrder: (index + 1) * 1000,
          }))
      : ([] as AssignedBlockEntry[]),
    templates: (task?.clientTemplateAttachments ?? []).map((a) => ({
      storageId: String(a.storageId),
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.size,
    })) as FileTaskClientTemplateAttachment[],
    isRequired: task?.isRequired ?? true,
    isPortalVisible:
      taskType === "internal_task"
        ? false
        : (task?.isPortalVisible ?? defaultPortalVisibleForTaskType(taskType)),
    dueDateInput: toDateInputValue(task?.dueDate),
    priority: (task?.priority ?? undefined) as FileTaskPriority | undefined,
  };
}

export function FileTaskConfigModal({
  open,
  onClose,
  mode,
  initialTask,
  pipelineFileId,
  memberUserKey,
  onSubmit,
}: FileTaskConfigModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<FileTaskType>("document_upload");
  const [instruction, setInstruction] = useState("");
  const [instructionUrl, setInstructionUrl] = useState("");
  const [blocks, setBlocks] = useState<AssignedBlockEntry[]>([]);
  const [templates, setTemplates] = useState<FileTaskClientTemplateAttachment[]>(
    [],
  );
  const [isRequired, setIsRequired] = useState(true);
  const [isPortalVisible, setIsPortalVisible] = useState(true);
  const [dueDateInput, setDueDateInput] = useState("");
  const [priority, setPriority] = useState<FileTaskPriority | "">("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial = buildInitialState(initialTask);
    setTitle(initial.title);
    setDescription(initial.description);
    setTaskType(initial.taskType);
    setInstruction(initial.instruction);
    setInstructionUrl(initial.instructionUrl);
    setBlocks(initial.blocks);
    setTemplates(initial.templates);
    setIsRequired(initial.isRequired);
    setIsPortalVisible(initial.isPortalVisible);
    setDueDateInput(initial.dueDateInput);
    setPriority(initial.priority ?? "");
  }, [open, initialTask?._id]);

  const handleTaskTypeChange = (next: FileTaskType) => {
    setTaskType(next);
    if (next === "internal_task") {
      setIsPortalVisible(false);
    } else if (!isPortalVisible) {
      setIsPortalVisible(defaultPortalVisibleForTaskType(next));
    }
    if (!taskTypeAllowsClientTemplates(next)) {
      setTemplates([]);
    }
  };

  if (!open) return null;

  const visibilityLocked = taskType === "internal_task";

  return (
    <OverlayShell
      open
      onClose={onClose}
      aria-label={mode === "create" ? "Create file task" : "Edit file task"}
      panelClassName="flex max-h-[min(92dvh,720px)] w-full max-w-2xl flex-col p-0"
    >
      <div className="shrink-0 border-b border-border/50 px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">
          {mode === "create" ? "Create file task" : "Edit file task"}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Configure global settings and choose what the client or team must do.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Title
            </label>
            <Input
              className="mt-1"
              placeholder="e.g. 6 months bank statements"
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </label>
            <textarea
              className="mt-1 min-h-[3.5rem] w-full rounded-dlc-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Optional notes for your team or the client"
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Due date
              </label>
              <Input
                type="date"
                className="mt-1"
                value={dueDateInput}
                disabled={busy}
                onChange={(e) => setDueDateInput(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Priority
              </label>
              <select
                className="mt-1 h-9 w-full rounded-dlc-md border border-border bg-background px-3 text-sm"
                value={priority}
                disabled={busy}
                onChange={(e) =>
                  setPriority(e.target.value as FileTaskPriority | "")
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
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={isRequired}
                disabled={busy}
                onChange={(e) => setIsRequired(e.target.checked)}
              />
              Required
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Visibility
              </span>
              <button
                type="button"
                disabled={busy || visibilityLocked}
                className={cn(
                  "rounded-dlc-sm px-2 py-1 text-xs font-medium transition-colors",
                  !isPortalVisible
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/50 text-muted-foreground",
                  visibilityLocked && "opacity-60",
                )}
                onClick={() => setIsPortalVisible(false)}
              >
                Internal
              </button>
              <button
                type="button"
                disabled={busy || visibilityLocked}
                className={cn(
                  "rounded-dlc-sm px-2 py-1 text-xs font-medium transition-colors",
                  isPortalVisible
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/50 text-muted-foreground",
                  visibilityLocked && "opacity-60",
                )}
                onClick={() => setIsPortalVisible(true)}
              >
                Client
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5">
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
                  disabled={busy}
                  className={cn(
                    "shrink-0 rounded-dlc-sm px-3 py-1.5 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard",
                    selected
                      ? "bg-background text-foreground shadow-dlc-1"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => handleTaskTypeChange(type)}
                >
                  {FILE_TASK_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-dlc-md border border-border/60 bg-dlc-surface p-3">
          {taskType === "document_upload" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {FILE_TASK_TYPE_DESCRIPTIONS.document_upload}
              </p>
              {pipelineFileId ? (
                <FileTaskClientTemplateAttach
                  pipelineFileId={pipelineFileId}
                  memberUserKey={memberUserKey}
                  value={templates}
                  onChange={setTemplates}
                  disabled={busy}
                />
              ) : null}
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
                  disabled={busy}
                  onChange={(e) => setInstructionUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Instruction text
                </label>
                <textarea
                  className="mt-1 min-h-[6rem] w-full rounded-dlc-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="e.g. Visit the appraisal payment portal and pay the $450 fee before Friday."
                  value={instruction}
                  disabled={busy}
                  onChange={(e) => setInstruction(e.target.value)}
                />
              </div>
              {pipelineFileId ? (
                <FileTaskClientTemplateAttach
                  pipelineFileId={pipelineFileId}
                  memberUserKey={memberUserKey}
                  value={templates}
                  onChange={setTemplates}
                  disabled={busy}
                />
              ) : null}
            </div>
          ) : null}
          {taskType === "block_assignment" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {FILE_TASK_TYPE_DESCRIPTIONS.block_assignment}
              </p>
              <FileTaskAtomicBlockBuilder
                value={blocks}
                onChange={setBlocks}
                pipelineFileId={pipelineFileId}
                memberUserKey={memberUserKey}
                disabled={busy}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border/50 px-5 py-4">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !title.trim()}
          data-testid="file-task-config-submit"
          onClick={() => {
            void (async () => {
              const err = validateTaskTypeConfig({
                taskType,
                clientInstructionText: instruction,
                instructionUrl,
                assignedBlockEntries: blocks,
              });
              if (err) {
                showOperationalToast({
                  title: mode === "create" ? "Cannot create task" : "Cannot save",
                  description: err,
                  variant: "destructive",
                });
                return;
              }
              setBusy(true);
              try {
                await onSubmit({
                  title: title.trim(),
                  description: description.trim() || undefined,
                  taskType,
                  clientInstructionText:
                    taskType === "client_instruction" ? instruction.trim() : undefined,
                  instructionUrl:
                    taskType === "client_instruction"
                      ? instructionUrl.trim() || undefined
                      : undefined,
                  assignedBlockEntries:
                    taskType === "block_assignment" ? blocks : undefined,
                  clientTemplateAttachments: taskTypeAllowsClientTemplates(
                    taskType,
                  )
                    ? templates
                    : undefined,
                  isRequired,
                  isPortalVisible:
                    taskType === "internal_task" ? false : isPortalVisible,
                  dueDate: parseDateInput(dueDateInput),
                  priority: priority || undefined,
                });
                showOperationalToast({
                  title: mode === "create" ? "File task created" : "File task saved",
                  variant: "success",
                });
                onClose();
              } catch (e) {
                showOperationalToast({
                  title: mode === "create" ? "Cannot create task" : "Cannot save",
                  description:
                    e instanceof Error ? e.message : "Something went wrong.",
                  variant: "destructive",
                });
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create task"
              : "Save changes"}
        </Button>
      </div>
    </OverlayShell>
  );
}
