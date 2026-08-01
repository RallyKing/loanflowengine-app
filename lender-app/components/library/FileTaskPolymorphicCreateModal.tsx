"use client";

import { useState } from "react";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { Button } from "@/components/ui/Button";
import { FileTaskTypeConfigurator } from "@/components/library/FileTaskTypeConfigurator";
import {
  defaultPortalVisibleForTaskType,
  validateTaskTypeConfig,
  type AssignedBlockEntry,
  type FileTaskType,
} from "@/lib/documentVaultTaskTypes";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export type FileTaskPolymorphicCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    taskType: FileTaskType;
    clientInstructionText?: string;
    assignedBlockEntries?: AssignedBlockEntry[];
    isRequired: boolean;
    isPortalVisible: boolean;
  }) => Promise<void>;
};

export function FileTaskPolymorphicCreateModal({
  open,
  onClose,
  onSubmit,
}: FileTaskPolymorphicCreateModalProps) {
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<FileTaskType>("document_upload");
  const [instruction, setInstruction] = useState("");
  const [blocks, setBlocks] = useState<AssignedBlockEntry[]>([]);
  const [isRequired, setIsRequired] = useState(true);
  const [isPortalVisible, setIsPortalVisible] = useState(true);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle("");
    setTaskType("document_upload");
    setInstruction("");
    setBlocks([]);
    setIsRequired(true);
    setIsPortalVisible(true);
  };

  const handleTaskTypeChange = (next: FileTaskType) => {
    setTaskType(next);
    if (next === "internal_task") setIsPortalVisible(false);
    else setIsPortalVisible(defaultPortalVisibleForTaskType(next));
  };

  if (!open) return null;

  return (
    <OverlayShell
      open
      onClose={onClose}
      aria-label="Create file task"
      panelClassName="w-full max-w-lg p-5"
    >
      <h3 className="text-sm font-semibold text-foreground">Create file task</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Choose what the client (or your team) needs to do for this requirement.
      </p>

      <div className="mt-4 max-h-[min(70dvh,520px)] overflow-y-auto overscroll-contain pr-1">
        <FileTaskTypeConfigurator
          title={title}
          onTitleChange={setTitle}
          taskType={taskType}
          onTaskTypeChange={handleTaskTypeChange}
          clientInstructionText={instruction}
          onClientInstructionTextChange={setInstruction}
          assignedBlockEntries={blocks}
          onAssignedBlockEntriesChange={setBlocks}
          isRequired={isRequired}
          onRequiredChange={setIsRequired}
          isPortalVisible={isPortalVisible}
          onPortalVisibleChange={setIsPortalVisible}
          disabled={busy}
        />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !title.trim()}
          data-testid="file-task-polymorphic-create-submit"
          onClick={() => {
            void (async () => {
              const err = validateTaskTypeConfig({
                taskType,
                clientInstructionText: instruction,
                assignedBlockEntries: blocks,
              });
              if (err) {
                showOperationalToast({
                  title: "Cannot create task",
                  description: err,
                  variant: "destructive",
                });
                return;
              }
              setBusy(true);
              try {
                await onSubmit({
                  title: title.trim(),
                  taskType,
                  clientInstructionText:
                    taskType === "client_instruction" ? instruction.trim() : undefined,
                  assignedBlockEntries:
                    taskType === "block_assignment" ? blocks : undefined,
                  isRequired,
                  isPortalVisible:
                    taskType === "internal_task" ? false : isPortalVisible,
                });
                reset();
                onClose();
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? "Creating…" : "Create task"}
        </Button>
      </div>
    </OverlayShell>
  );
}
