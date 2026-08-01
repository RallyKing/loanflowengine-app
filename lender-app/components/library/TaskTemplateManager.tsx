"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Settings2, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  RecordInspectorBody,
  RecordInspectorFooter,
  RecordInspectorHeader,
  RecordInspectorShell,
  RecordInspectorSubtitle,
} from "@/components/RecordInspectorShell";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { FileTaskTypeConfigurator } from "@/components/library/FileTaskTypeConfigurator";
import {
  defaultPortalVisibleForTaskType,
  normalizeAssignedBlockEntries,
  resolveTaskType,
  validateTaskTypeConfig,
  type AssignedBlockEntry,
  type FileTaskPriority,
  type FileTaskType,
} from "@/lib/documentVaultTaskTypes";
import {
  folderRowsToTree,
  folderTreeToRows,
  type FolderTemplateNode,
} from "@/lib/library/folderTemplateTypes";

export type TaskTemplateManagerProps = {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  onError?: (message: string) => void;
  /** Render inline (settings page) instead of slide-over shell. */
  embedded?: boolean;
};

type SidebarSection = "stacks" | "individual";

type StackSelection =
  | { mode: "new" }
  | { mode: "edit"; stackId: Id<"documentTaskTemplateStacks"> };

type TemplateSelection =
  | { mode: "new" }
  | { mode: "edit"; templateId: Id<"documentTaskTemplates"> };

const EMPTY_TEMPLATE_DRAFT = {
  title: "",
  description: "",
  isRequired: true,
  isPortalVisible: true,
  taskType: "document_upload" as FileTaskType,
  clientInstructionText: "",
  instructionUrl: "",
  priority: "" as FileTaskPriority | "",
  dueOffsetDays: null as number | null,
  assignedBlockEntries: [] as AssignedBlockEntry[],
  folderTemplateNodes: [] as FolderTemplateNode[],
};

function templateDraftFromDoc(tpl: Doc<"documentTaskTemplates">) {
  const taskType = resolveTaskType(tpl.taskType);
  return {
    title: tpl.title,
    description: tpl.description ?? "",
    isRequired: tpl.isRequired,
    isPortalVisible:
      taskType === "internal_task" ? false : tpl.isPortalVisible,
    taskType,
    clientInstructionText: tpl.clientInstructionText ?? "",
    instructionUrl: tpl.instructionUrl ?? "",
    priority: (tpl.priority ?? "") as FileTaskPriority | "",
    dueOffsetDays: tpl.dueOffsetDays ?? null,
    assignedBlockEntries: normalizeAssignedBlockEntries(tpl),
    folderTemplateNodes: folderRowsToTree(tpl.folderTemplate ?? []),
  };
}

export function TaskTemplateManager({
  open,
  onClose,
  organizationId,
  memberUserKey,
  onError,
  embedded = false,
}: TaskTemplateManagerProps) {
  const [sidebarSection, setSidebarSection] =
    useState<SidebarSection>("stacks");
  const [stackSelection, setStackSelection] = useState<StackSelection>({
    mode: "new",
  });
  const [templateSelection, setTemplateSelection] =
    useState<TemplateSelection | null>(null);
  const [stackName, setStackName] = useState("");
  const [stackDescription, setStackDescription] = useState("");
  const [templateTitle, setTemplateTitle] = useState(EMPTY_TEMPLATE_DRAFT.title);
  const [templateDescription, setTemplateDescription] = useState(
    EMPTY_TEMPLATE_DRAFT.description,
  );
  const [isRequired, setIsRequired] = useState(EMPTY_TEMPLATE_DRAFT.isRequired);
  const [isPortalVisible, setIsPortalVisible] = useState(
    EMPTY_TEMPLATE_DRAFT.isPortalVisible,
  );
  const [taskType, setTaskType] = useState<FileTaskType>(
    EMPTY_TEMPLATE_DRAFT.taskType,
  );
  const [clientInstructionText, setClientInstructionText] = useState(
    EMPTY_TEMPLATE_DRAFT.clientInstructionText,
  );
  const [instructionUrl, setInstructionUrl] = useState(
    EMPTY_TEMPLATE_DRAFT.instructionUrl,
  );
  const [priority, setPriority] = useState<FileTaskPriority | "">(
    EMPTY_TEMPLATE_DRAFT.priority,
  );
  const [dueOffsetDays, setDueOffsetDays] = useState<number | null>(
    EMPTY_TEMPLATE_DRAFT.dueOffsetDays,
  );
  const [assignedBlockEntries, setAssignedBlockEntries] = useState<
    AssignedBlockEntry[]
  >(EMPTY_TEMPLATE_DRAFT.assignedBlockEntries);
  const [folderTemplateNodes, setFolderTemplateNodes] = useState<
    FolderTemplateNode[]
  >(EMPTY_TEMPLATE_DRAFT.folderTemplateNodes);
  const [busy, setBusy] = useState(false);
  const [didAutoSelectStack, setDidAutoSelectStack] = useState(false);

  const library = useQuery(
    api.documentTaskTemplates.listStacksWithTemplates,
    (open || embedded) && organizationId && memberUserKey
      ? { organizationId, memberUserKey }
      : "skip",
  );

  const createStack = useMutation(api.documentTaskTemplates.createTemplateStack);
  const updateStack = useMutation(api.documentTaskTemplates.updateTemplateStack);
  const deleteStack = useMutation(api.documentTaskTemplates.deleteTemplateStack);
  const createTemplate = useMutation(api.documentTaskTemplates.createTemplate);
  const updateTemplate = useMutation(api.documentTaskTemplates.updateTemplate);
  const deleteTemplate = useMutation(api.documentTaskTemplates.deleteTemplate);
  const addToStack = useMutation(api.documentTaskTemplates.addTemplateToStack);
  const removeFromStack = useMutation(
    api.documentTaskTemplates.removeTemplateFromStack,
  );

  const resetTemplateDraft = useCallback(() => {
    setTemplateTitle(EMPTY_TEMPLATE_DRAFT.title);
    setTemplateDescription(EMPTY_TEMPLATE_DRAFT.description);
    setIsRequired(EMPTY_TEMPLATE_DRAFT.isRequired);
    setIsPortalVisible(EMPTY_TEMPLATE_DRAFT.isPortalVisible);
    setTaskType(EMPTY_TEMPLATE_DRAFT.taskType);
    setClientInstructionText(EMPTY_TEMPLATE_DRAFT.clientInstructionText);
    setInstructionUrl(EMPTY_TEMPLATE_DRAFT.instructionUrl);
    setPriority(EMPTY_TEMPLATE_DRAFT.priority);
    setDueOffsetDays(EMPTY_TEMPLATE_DRAFT.dueOffsetDays);
    setAssignedBlockEntries(EMPTY_TEMPLATE_DRAFT.assignedBlockEntries);
    setFolderTemplateNodes(EMPTY_TEMPLATE_DRAFT.folderTemplateNodes);
  }, []);

  const loadTemplateDraft = useCallback((tpl: Doc<"documentTaskTemplates">) => {
    const draft = templateDraftFromDoc(tpl);
    setTemplateTitle(draft.title);
    setTemplateDescription(draft.description);
    setIsRequired(draft.isRequired);
    setIsPortalVisible(draft.isPortalVisible);
    setTaskType(draft.taskType);
    setClientInstructionText(draft.clientInstructionText);
    setInstructionUrl(draft.instructionUrl);
    setPriority(draft.priority);
    setDueOffsetDays(draft.dueOffsetDays);
    setAssignedBlockEntries(draft.assignedBlockEntries);
    setFolderTemplateNodes(draft.folderTemplateNodes);
  }, []);

  const handleTaskTypeChange = useCallback((next: FileTaskType) => {
    setTaskType(next);
    if (next === "internal_task") {
      setIsPortalVisible(false);
    } else if (!isPortalVisible) {
      setIsPortalVisible(defaultPortalVisibleForTaskType(next));
    }
  }, [isPortalVisible]);

  const activeStack = useMemo(() => {
    if (stackSelection.mode !== "edit" || !library) return null;
    return (
      library.stacks.find((s) => String(s._id) === String(stackSelection.stackId)) ??
      null
    );
  }, [library, stackSelection]);

  const activeTemplate = useMemo(() => {
    if (
      !library ||
      !templateSelection ||
      templateSelection.mode !== "edit"
    ) {
      return null;
    }
    const id = String(templateSelection.templateId);
    for (const stack of library.stacks) {
      const hit = stack.templates.find((t) => String(t._id) === id);
      if (hit) return hit;
    }
    return (
      library.individualTemplates.find((t) => String(t._id) === id) ?? null
    );
  }, [library, templateSelection]);

  const availableForStack = useMemo(() => {
    if (!library || stackSelection.mode !== "edit") return [];
    const inStack = new Set(
      (activeStack?.templates ?? []).map((t) => String(t._id)),
    );
    return [
      ...library.individualTemplates,
      ...library.stacks.flatMap((s) =>
        String(s._id) !== String(stackSelection.stackId) ? s.templates : [],
      ),
    ].filter((t) => !inStack.has(String(t._id)));
  }, [library, activeStack, stackSelection]);

  useEffect(() => {
    if (!library || didAutoSelectStack || library.stacks.length === 0) return;
    const first = library.stacks[0]!;
    setStackSelection({ mode: "edit", stackId: first._id });
    setStackName(first.name);
    setStackDescription(first.description ?? "");
    setDidAutoSelectStack(true);
  }, [library, didAutoSelectStack]);

  const run = async (fn: () => Promise<void>) => {
    if (!memberUserKey || busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Action failed.";
      onError?.(msg);
      showOperationalToast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleNewStack = () => {
    setSidebarSection("stacks");
    setStackSelection({ mode: "new" });
    setStackName("");
    setStackDescription("");
    setTemplateSelection(null);
    resetTemplateDraft();
  };

  const handleSelectStack = (stack: Doc<"documentTaskTemplateStacks">) => {
    setSidebarSection("stacks");
    setStackSelection({ mode: "edit", stackId: stack._id });
    setStackName(stack.name);
    setStackDescription(stack.description ?? "");
    setTemplateSelection(null);
    resetTemplateDraft();
  };

  const handleSaveStack = () =>
    run(async () => {
      if (stackSelection.mode === "new") {
        const result = await createStack({
          organizationId,
          memberUserKey,
          name: stackName,
          description: stackDescription || undefined,
        });
        setStackSelection({ mode: "edit", stackId: result.stackId });
        showOperationalToast({ title: "Stack created" });
        return;
      }
      await updateStack({
        organizationId,
        memberUserKey,
        stackId: stackSelection.stackId,
        name: stackName,
        description: stackDescription || undefined,
      });
      showOperationalToast({ title: "Stack saved" });
    });

  const handleDeleteStack = () =>
    run(async () => {
      if (stackSelection.mode !== "edit") return;
      await deleteStack({
        organizationId,
        memberUserKey,
        stackId: stackSelection.stackId,
      });
      handleNewStack();
      showOperationalToast({ title: "Stack deleted" });
    });

  const handleNewTemplate = () => {
    setTemplateSelection({ mode: "new" });
    resetTemplateDraft();
  };

  const handleSelectTemplate = (tpl: Doc<"documentTaskTemplates">) => {
    setTemplateSelection({ mode: "edit", templateId: tpl._id });
    loadTemplateDraft(tpl);
    if (tpl.stackId) {
      const stack = library?.stacks.find(
        (s) => String(s._id) === String(tpl.stackId),
      );
      if (stack) {
        setSidebarSection("stacks");
        setStackSelection({ mode: "edit", stackId: stack._id });
        setStackName(stack.name);
        setStackDescription(stack.description ?? "");
      }
    } else {
      setSidebarSection("individual");
    }
  };

  const handleSaveTemplate = () =>
    run(async () => {
      const validationError = validateTaskTypeConfig({
        taskType,
        clientInstructionText,
        instructionUrl,
        assignedBlockEntries,
        description: templateDescription,
        priority: priority || undefined,
        dueDate: undefined,
      });
      if (validationError) {
        showOperationalToast({
          title: "Cannot save template",
          description: validationError,
          variant: "destructive",
        });
        return;
      }

      const payload = {
        organizationId,
        memberUserKey,
        title: templateTitle,
        description: templateDescription.trim() || undefined,
        isRequired,
        isPortalVisible: taskType === "internal_task" ? false : isPortalVisible,
        taskType,
        clientInstructionText:
          taskType === "client_instruction" ? clientInstructionText : undefined,
        instructionUrl:
          taskType === "client_instruction"
            ? instructionUrl.trim() || undefined
            : undefined,
        assignedBlockEntries:
          taskType === "block_assignment" ? assignedBlockEntries : undefined,
        folderTemplate:
          taskType === "document_upload"
            ? folderTreeToRows(folderTemplateNodes)
            : undefined,
        priority: priority || undefined,
        dueOffsetDays: dueOffsetDays ?? undefined,
      };

      if (templateSelection?.mode === "edit") {
        await updateTemplate({
          ...payload,
          templateId: templateSelection.templateId,
          dueOffsetDays: dueOffsetDays == null ? null : dueOffsetDays,
        });
        showOperationalToast({ title: "Task template saved" });
        return;
      }

      const stackId =
        sidebarSection === "stacks" && stackSelection.mode === "edit"
          ? stackSelection.stackId
          : undefined;

      const result = await createTemplate({
        ...payload,
        stackId,
      });
      setTemplateSelection({
        mode: "edit",
        templateId: result.templateId,
      });
      showOperationalToast({ title: "Task template created" });
    });

  const handleDeleteTemplate = () =>
    run(async () => {
      if (templateSelection?.mode !== "edit") return;
      await deleteTemplate({
        organizationId,
        memberUserKey,
        templateId: templateSelection.templateId,
      });
      setTemplateSelection(null);
      resetTemplateDraft();
      showOperationalToast({ title: "Template deleted" });
    });

  const handleAddToStack = (templateId: Id<"documentTaskTemplates">) =>
    run(async () => {
      if (stackSelection.mode !== "edit") return;
      await addToStack({
        organizationId,
        memberUserKey,
        templateId,
        stackId: stackSelection.stackId,
      });
      showOperationalToast({ title: "Added to stack" });
    });

  const handleRemoveFromStack = (templateId: Id<"documentTaskTemplates">) =>
    run(async () => {
      await removeFromStack({ organizationId, memberUserKey, templateId });
      if (
        templateSelection?.mode === "edit" &&
        String(templateSelection.templateId) === String(templateId)
      ) {
        setTemplateSelection(null);
        resetTemplateDraft();
      }
      showOperationalToast({ title: "Removed from stack" });
    });

  if (!open && !embedded) return null;

  const workspace = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <aside
        className="flex w-full shrink-0 flex-col border-b border-border/60 md:w-72 md:border-b-0 md:border-r"
        data-testid="template-manager-sidebar"
      >
        <div className="flex shrink-0 gap-1 border-b border-border/50 p-2">
          {(["stacks", "individual"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={cn(
                "flex-1 rounded-dlc-sm px-2 py-1.5 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard",
                sidebarSection === id
                  ? "bg-dlc-surface-high text-foreground shadow-dlc-1"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setSidebarSection(id);
                setTemplateSelection(null);
                resetTemplateDraft();
              }}
            >
              {id === "stacks" ? "Stacks" : "Individual"}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain p-2">
          {library === undefined ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            </div>
          ) : sidebarSection === "stacks" ? (
            <div className="space-y-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full gap-1"
                disabled={busy}
                onClick={handleNewStack}
                data-testid="template-manager-new-stack"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New template stack
              </Button>
              <ul className="space-y-0.5">
                {library.stacks.length === 0 ? (
                  <li className="px-2 py-3 text-xs text-muted-foreground">
                    No stacks yet. Create one to get started.
                  </li>
                ) : (
                  library.stacks.map((stack) => {
                    const selected =
                      stackSelection.mode === "edit" &&
                      String(stackSelection.stackId) === String(stack._id);
                    return (
                      <li key={stack._id}>
                        <button
                          type="button"
                          className={cn(
                            "w-full rounded-dlc-sm px-2 py-2 text-left transition-colors",
                            selected
                              ? "bg-primary/10 text-foreground"
                              : "hover:bg-muted/40 text-foreground",
                          )}
                          onClick={() => handleSelectStack(stack)}
                        >
                          <span className="block truncate text-sm font-medium">
                            {stack.name}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {stack.templates.length} task
                            {stack.templates.length === 1 ? "" : "s"}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full gap-1"
                disabled={busy}
                onClick={() => {
                  setSidebarSection("individual");
                  handleNewTemplate();
                }}
                data-testid="template-manager-new-individual"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New individual task
              </Button>
              <ul className="space-y-0.5">
                {library.individualTemplates.length === 0 ? (
                  <li className="px-2 py-3 text-xs text-muted-foreground">
                    No individual tasks yet.
                  </li>
                ) : (
                  library.individualTemplates.map((tpl) => {
                    const selected =
                      templateSelection?.mode === "edit" &&
                      String(templateSelection.templateId) === String(tpl._id);
                    return (
                      <li key={tpl._id}>
                        <button
                          type="button"
                          className={cn(
                            "w-full rounded-dlc-sm px-2 py-2 text-left transition-colors",
                            selected
                              ? "bg-primary/10 text-foreground"
                              : "hover:bg-muted/40 text-foreground",
                          )}
                          onClick={() => handleSelectTemplate(tpl)}
                        >
                          <span className="block truncate text-sm font-medium">
                            {tpl.title}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          )}
        </div>
      </aside>

      <main
        className="min-h-0 min-w-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain p-4"
        data-testid="template-manager-canvas"
      >
        {library === undefined ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          </div>
        ) : sidebarSection === "stacks" ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <section className="space-y-3 rounded-dlc-md border border-border/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {stackSelection.mode === "new"
                      ? "New template stack"
                      : "Template stack"}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Name the stack and save before adding tasks.
                  </p>
                </div>
                {stackSelection.mode === "edit" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void handleDeleteStack()}
                    aria-label="Delete stack"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
              <Input
                placeholder="Stack name (e.g. SBA 7a Pack)"
                value={stackName}
                onChange={(e) => setStackName(e.target.value)}
              />
              <Input
                placeholder="Description (optional)"
                value={stackDescription}
                onChange={(e) => setStackDescription(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={busy || !stackName.trim()}
                onClick={() => void handleSaveStack()}
              >
                {stackSelection.mode === "new" ? "Create stack" : "Save stack"}
              </Button>
            </section>

            {stackSelection.mode === "edit" && activeStack ? (
              <>
                <section className="space-y-3 rounded-dlc-md border border-border/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Tasks in stack ({activeStack.templates.length})
                    </h3>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={busy}
                      onClick={handleNewTemplate}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      New task
                    </Button>
                  </div>
                  <ul className="space-y-1">
                    {activeStack.templates.map((tpl) => {
                      const selected =
                        templateSelection?.mode === "edit" &&
                        String(templateSelection.templateId) === String(tpl._id);
                      return (
                        <li
                          key={tpl._id}
                          className={cn(
                            "flex items-center gap-2 rounded-dlc-sm border px-2 py-1.5",
                            selected
                              ? "border-primary/40 bg-primary/5"
                              : "border-border/50 hover:bg-muted/20",
                          )}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left text-sm"
                            onClick={() => handleSelectTemplate(tpl)}
                          >
                            {tpl.title}
                          </button>
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label={`Remove ${tpl.title} from stack`}
                            onClick={() => void handleRemoveFromStack(tpl._id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                    {activeStack.templates.length === 0 ? (
                      <li className="text-xs text-muted-foreground">
                        No tasks in this stack yet.
                      </li>
                    ) : null}
                  </ul>

                  {availableForStack.length > 0 ? (
                    <div className="space-y-2 border-t border-border/50 pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Add existing task
                      </p>
                      <select
                        className="h-9 w-full rounded-dlc-md border border-border bg-background px-2 text-sm"
                        defaultValue=""
                        onChange={(e) => {
                          const id = e.target
                            .value as Id<"documentTaskTemplates">;
                          if (id) void handleAddToStack(id);
                          e.target.value = "";
                        }}
                      >
                        <option value="">Choose task to add…</option>
                        {availableForStack.map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </section>

                {templateSelection ? (
                  <TemplateEditorPanel
                    mode={templateSelection.mode}
                    title={templateTitle}
                    onTitleChange={setTemplateTitle}
                    description={templateDescription}
                    onDescriptionChange={setTemplateDescription}
                    taskType={taskType}
                    onTaskTypeChange={handleTaskTypeChange}
                    clientInstructionText={clientInstructionText}
                    onClientInstructionTextChange={setClientInstructionText}
                    instructionUrl={instructionUrl}
                    onInstructionUrlChange={setInstructionUrl}
                    assignedBlockEntries={assignedBlockEntries}
                    onAssignedBlockEntriesChange={setAssignedBlockEntries}
                    folderTemplateNodes={folderTemplateNodes}
                    onFolderTemplateNodesChange={setFolderTemplateNodes}
                    isRequired={isRequired}
                    onRequiredChange={setIsRequired}
                    isPortalVisible={isPortalVisible}
                    onPortalVisibleChange={setIsPortalVisible}
                    priority={priority}
                    onPriorityChange={setPriority}
                    dueOffsetDays={dueOffsetDays}
                    onDueOffsetDaysChange={setDueOffsetDays}
                    busy={busy}
                    onSave={() => void handleSaveTemplate()}
                    onDelete={
                      templateSelection.mode === "edit"
                        ? () => void handleDeleteTemplate()
                        : undefined
                    }
                    activeTemplateTitle={activeTemplate?.title}
                  />
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    Select a task above or click New task to edit.
                  </p>
                )}
              </>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl">
            {templateSelection ? (
              <TemplateEditorPanel
                mode={templateSelection.mode}
                title={templateTitle}
                onTitleChange={setTemplateTitle}
                description={templateDescription}
                onDescriptionChange={setTemplateDescription}
                taskType={taskType}
                onTaskTypeChange={handleTaskTypeChange}
                clientInstructionText={clientInstructionText}
                onClientInstructionTextChange={setClientInstructionText}
                instructionUrl={instructionUrl}
                onInstructionUrlChange={setInstructionUrl}
                assignedBlockEntries={assignedBlockEntries}
                onAssignedBlockEntriesChange={setAssignedBlockEntries}
                folderTemplateNodes={folderTemplateNodes}
                onFolderTemplateNodesChange={setFolderTemplateNodes}
                isRequired={isRequired}
                onRequiredChange={setIsRequired}
                isPortalVisible={isPortalVisible}
                onPortalVisibleChange={setIsPortalVisible}
                priority={priority}
                onPriorityChange={setPriority}
                dueOffsetDays={dueOffsetDays}
                onDueOffsetDaysChange={setDueOffsetDays}
                busy={busy}
                onSave={() => void handleSaveTemplate()}
                onDelete={
                  templateSelection.mode === "edit"
                    ? () => void handleDeleteTemplate()
                    : undefined
                }
                activeTemplateTitle={activeTemplate?.title}
              />
            ) : (
              <div className="rounded-dlc-md border border-dashed border-border/70 px-6 py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  Select an individual task from the sidebar or create a new one.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );

  const header = (
    <RecordInspectorHeader id="manage-templates-title">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">
              Manage Templates
            </h2>
          </div>
          <RecordInspectorSubtitle>
            Build template stacks and baseline file tasks for your document vault.
          </RecordInspectorSubtitle>
        </div>
        {!embedded ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>
    </RecordInspectorHeader>
  );

  if (embedded) {
    return (
      <div
        className="dlc-surface-card flex min-h-[min(80dvh,720px)] flex-col overflow-hidden rounded-dlc-lg border border-border/70"
        data-testid="template-manager-embedded"
      >
        <div className="shrink-0 border-b border-border/60 px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">
            Manage Templates
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Build template stacks and baseline file tasks for your document vault.
          </p>
        </div>
        {workspace}
      </div>
    );
  }

  return (
    <RecordInspectorShell
      onClose={onClose}
      recordKind="document"
      ariaLabel="Manage task templates"
      fullScreen
    >
      {header}
      <RecordInspectorBody className="flex min-h-0 flex-1 overflow-hidden p-0">
        {workspace}
      </RecordInspectorBody>
      <RecordInspectorFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Done
        </Button>
      </RecordInspectorFooter>
    </RecordInspectorShell>
  );
}

function TemplateEditorPanel({
  mode,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  taskType,
  onTaskTypeChange,
  clientInstructionText,
  onClientInstructionTextChange,
  instructionUrl,
  onInstructionUrlChange,
  assignedBlockEntries,
  onAssignedBlockEntriesChange,
  folderTemplateNodes,
  onFolderTemplateNodesChange,
  isRequired,
  onRequiredChange,
  isPortalVisible,
  onPortalVisibleChange,
  priority,
  onPriorityChange,
  dueOffsetDays,
  onDueOffsetDaysChange,
  busy,
  onSave,
  onDelete,
  activeTemplateTitle,
}: {
  mode: "new" | "edit";
  title: string;
  onTitleChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  taskType: FileTaskType;
  onTaskTypeChange: (v: FileTaskType) => void;
  clientInstructionText: string;
  onClientInstructionTextChange: (v: string) => void;
  instructionUrl: string;
  onInstructionUrlChange: (v: string) => void;
  assignedBlockEntries: AssignedBlockEntry[];
  onAssignedBlockEntriesChange: (entries: AssignedBlockEntry[]) => void;
  folderTemplateNodes: FolderTemplateNode[];
  onFolderTemplateNodesChange: (nodes: FolderTemplateNode[]) => void;
  isRequired: boolean;
  onRequiredChange: (v: boolean) => void;
  isPortalVisible: boolean;
  onPortalVisibleChange: (v: boolean) => void;
  priority: FileTaskPriority | "";
  onPriorityChange: (v: FileTaskPriority | "") => void;
  dueOffsetDays: number | null;
  onDueOffsetDaysChange: (v: number | null) => void;
  busy: boolean;
  onSave: () => void;
  onDelete?: () => void;
  activeTemplateTitle?: string;
}) {
  return (
    <section
      className="space-y-3 rounded-dlc-md border border-border/60 p-4"
      data-testid="template-editor-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {mode === "new" ? "New task template" : "Edit task template"}
          </h3>
          {mode === "edit" && activeTemplateTitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Editing {activeTemplateTitle}
            </p>
          ) : null}
        </div>
        {onDelete ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onDelete}
            aria-label="Delete template"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      <FileTaskTypeConfigurator
        variant="full"
        title={title}
        onTitleChange={onTitleChange}
        description={description}
        onDescriptionChange={onDescriptionChange}
        taskType={taskType}
        onTaskTypeChange={onTaskTypeChange}
        clientInstructionText={clientInstructionText}
        onClientInstructionTextChange={onClientInstructionTextChange}
        instructionUrl={instructionUrl}
        onInstructionUrlChange={onInstructionUrlChange}
        assignedBlockEntries={assignedBlockEntries}
        onAssignedBlockEntriesChange={onAssignedBlockEntriesChange}
        folderTemplateNodes={folderTemplateNodes}
        onFolderTemplateNodesChange={onFolderTemplateNodesChange}
        isRequired={isRequired}
        onRequiredChange={onRequiredChange}
        isPortalVisible={isPortalVisible}
        onPortalVisibleChange={onPortalVisibleChange}
        priority={priority}
        onPriorityChange={onPriorityChange}
        dueOffsetDays={dueOffsetDays}
        onDueOffsetDaysChange={onDueOffsetDaysChange}
        disabled={busy}
      />
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={busy || !title.trim()}
        onClick={onSave}
        data-testid="template-editor-save"
      >
        {mode === "new" ? "Create task template" : "Save task template"}
      </Button>
    </section>
  );
}
