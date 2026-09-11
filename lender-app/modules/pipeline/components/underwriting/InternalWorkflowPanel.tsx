"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { cn } from "@/lib/cn";
import { useDealWorkspaceEditor } from "@/lib/file/useDealWorkspaceEditor";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import {
  BUILTIN_INTERNAL_WORKFLOW_TEMPLATE_ID,
  defaultInternalWorkflowTemplateSteps,
  ensureInternalWorkflowItemIds,
  internalWorkflowProgress,
  newInternalWorkflowStepId,
  parseInternalWorkflowItems,
  serializeInternalWorkflowItems,
  templateStepsFromWorkflowItems,
  workflowItemsFromTemplateSteps,
  type InternalWorkflowItem,
} from "@/lib/pipeline/internalWorkflow";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";

export type InternalWorkflowPanelProps = {
  fileId: Id<"pipeline">;
  memberUserKey?: string;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function WorkflowCheckbox({
  done,
  onToggle,
  label,
}: {
  done: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark incomplete: ${label}` : `Mark complete: ${label}`}
      onClick={onToggle}
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-dlc-sm",
        "transition-colors duration-dlc-short ease-dlc-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1",
      )}
      data-testid="pipeline-underwriting-workflow-checkbox"
    >
      {done ? (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500 text-white shadow-dlc-1"
          aria-hidden
        >
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </span>
      ) : (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-border/80 bg-background"
          aria-hidden
        />
      )}
    </button>
  );
}

export function InternalWorkflowPanel({
  fileId: _fileId,
  memberUserKey: _memberUserKey,
}: InternalWorkflowPanelProps) {
  const { draft, update } = useDealWorkspaceEditor();
  const orgScope = useOrgConvexQueryArgs();
  const [templateName, setTemplateName] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [showSaveAs, setShowSaveAs] = useState(false);

  const listArgs = orgScope
    ? {
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
      }
    : "skip";
  const templates = useQuery(
    api.internalWorkflowTemplates.listForOrganization,
    listArgs,
  );
  const createTemplate = useMutation(api.internalWorkflowTemplates.create);
  const updateTemplate = useMutation(api.internalWorkflowTemplates.update);

  const workflowItems = useMemo(() => {
    if (!draft) return undefined;
    return parseInternalWorkflowItems(draft.workflow);
  }, [draft]);

  const activeTemplateId =
    typeof draft?.workflowTemplateId === "string"
      ? draft.workflowTemplateId
      : BUILTIN_INTERNAL_WORKFLOW_TEMPLATE_ID;

  const progress =
    workflowItems === undefined
      ? null
      : internalWorkflowProgress(workflowItems);

  const persistWorkflow = useCallback(
    (
      nextItems: InternalWorkflowItem[],
      templateId?: string | null,
    ) => {
      const serialized = serializeInternalWorkflowItems(nextItems);
      if (templateId === undefined) {
        update("workflow", serialized);
        return;
      }
      update("workflow", serialized);
      update(
        "workflowTemplateId",
        templateId === null ? undefined : templateId,
      );
    },
    [update],
  );

  const setItems = useCallback(
    (next: InternalWorkflowItem[]) => {
      persistWorkflow(next);
    },
    [persistWorkflow],
  );

  const toggleDone = useCallback(
    (stepId: string) => {
      if (!workflowItems) return;
      const next = ensureInternalWorkflowItemIds(workflowItems).map((item) => {
        if (item.id !== stepId) return item;
        const done = !item.done;
        return {
          ...item,
          done,
          date: done ? item.date || todayIsoDate() : item.date,
        };
      });
      setItems(next);
    },
    [setItems, workflowItems],
  );

  const renameStep = useCallback(
    (stepId: string, label: string) => {
      if (!workflowItems) return;
      setItems(
        workflowItems.map((item) =>
          item.id === stepId ? { ...item, label } : item,
        ),
      );
    },
    [setItems, workflowItems],
  );

  const removeStep = useCallback(
    (stepId: string) => {
      if (!workflowItems) return;
      setItems(workflowItems.filter((item) => item.id !== stepId));
    },
    [setItems, workflowItems],
  );

  const moveStep = useCallback(
    (stepId: string, direction: -1 | 1) => {
      if (!workflowItems) return;
      const idx = workflowItems.findIndex((item) => item.id === stepId);
      if (idx < 0) return;
      const target = idx + direction;
      if (target < 0 || target >= workflowItems.length) return;
      const next = [...workflowItems];
      const [row] = next.splice(idx, 1);
      if (!row) return;
      next.splice(target, 0, row);
      setItems(next);
    },
    [setItems, workflowItems],
  );

  const addStep = useCallback(() => {
    const base = workflowItems ?? [];
    setItems([
      ...base,
      {
        id: newInternalWorkflowStepId(),
        label: "New step",
        done: false,
      },
    ]);
  }, [setItems, workflowItems]);

  const applyTemplate = useCallback(
    (templateId: string) => {
      if (templateId === BUILTIN_INTERNAL_WORKFLOW_TEMPLATE_ID) {
        persistWorkflow(
          workflowItemsFromTemplateSteps(defaultInternalWorkflowTemplateSteps()),
          BUILTIN_INTERNAL_WORKFLOW_TEMPLATE_ID,
        );
        return;
      }
      const row = templates?.find((t) => t._id === templateId);
      if (!row) return;
      persistWorkflow(
        workflowItemsFromTemplateSteps(row.steps),
        row._id,
      );
    },
    [persistWorkflow, templates],
  );

  const saveAsTemplate = useCallback(async () => {
    if (!orgScope || !workflowItems) return;
    const name = templateName.trim();
    if (!name) {
      setTemplateError("Enter a template name.");
      return;
    }
    setTemplateBusy(true);
    setTemplateError(null);
    try {
      const steps = templateStepsFromWorkflowItems(workflowItems);
      const { templateId } = await createTemplate({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        name,
        steps,
      });
      update("workflowTemplateId", templateId);
      setTemplateName("");
      setShowSaveAs(false);
    } catch (err) {
      setTemplateError(
        err instanceof Error ? err.message : "Could not save template.",
      );
    } finally {
      setTemplateBusy(false);
    }
  }, [
    createTemplate,
    orgScope,
    templateName,
    update,
    workflowItems,
  ]);

  const overwriteActiveTemplate = useCallback(async () => {
    if (!orgScope || !workflowItems) return;
    if (
      !activeTemplateId ||
      activeTemplateId === BUILTIN_INTERNAL_WORKFLOW_TEMPLATE_ID
    ) {
      setShowSaveAs(true);
      return;
    }
    setTemplateBusy(true);
    setTemplateError(null);
    try {
      await updateTemplate({
        id: activeTemplateId as Id<"internalWorkflowTemplates">,
        memberUserKey: orgScope.memberUserKey,
        steps: templateStepsFromWorkflowItems(workflowItems),
      });
    } catch (err) {
      setTemplateError(
        err instanceof Error ? err.message : "Could not update template.",
      );
    } finally {
      setTemplateBusy(false);
    }
  }, [
    activeTemplateId,
    orgScope,
    updateTemplate,
    workflowItems,
  ]);

  if (workflowItems === undefined) {
    return (
      <div data-testid="pipeline-underwriting-workflow-skeleton">
        <OperationalSkeletonList rows={4} className="px-0.5" />
      </div>
    );
  }

  return (
    <div
      className="min-w-0 space-y-3"
      data-testid="pipeline-underwriting-workflow-panel"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Template
          </label>
          <Select
            value={activeTemplateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className="h-10 min-h-10 w-full max-w-md"
            data-testid="pipeline-underwriting-workflow-template-select"
            aria-label="Switch workflow template"
          >
            <option value={BUILTIN_INTERNAL_WORKFLOW_TEMPLATE_ID}>
              Default broker checklist (
              {defaultInternalWorkflowTemplateSteps().length} steps)
            </option>
            {(templates ?? []).map((t) => (
              <option key={t._id} value={t._id}>
                {t.name} ({t.stepCount})
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {progress ? (
            <span
              className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold tabular-nums text-muted-foreground"
              data-testid="pipeline-underwriting-workflow-progress"
            >
              {progress.completed}/{progress.total}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 min-h-10"
            disabled={templateBusy || !orgScope}
            onClick={() => {
              setShowSaveAs((v) => !v);
              setTemplateError(null);
            }}
            data-testid="pipeline-underwriting-workflow-save-as"
          >
            Save as template
          </Button>
          {activeTemplateId !== BUILTIN_INTERNAL_WORKFLOW_TEMPLATE_ID ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 min-h-10"
              disabled={templateBusy || !orgScope}
              onClick={() => void overwriteActiveTemplate()}
              data-testid="pipeline-underwriting-workflow-update-template"
            >
              Update template
            </Button>
          ) : null}
        </div>
      </div>

      {showSaveAs ? (
        <div
          className="flex flex-col gap-2 rounded-dlc-md border border-border/70 bg-dlc-surface-high/40 p-3 sm:flex-row sm:items-end"
          data-testid="pipeline-underwriting-workflow-save-as-form"
        >
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              New template name
            </label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Commercial underwriting"
              className="h-10 min-h-10"
              data-testid="pipeline-underwriting-workflow-template-name"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-10 min-h-10"
            disabled={templateBusy || !templateName.trim()}
            onClick={() => void saveAsTemplate()}
          >
            Create
          </Button>
        </div>
      ) : null}

      {templateError ? (
        <p className="text-xs text-destructive" role="alert">
          {templateError}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Check off mileposts as you go. Edit labels, reorder, or save this
        checklist as an org template to reuse on other files.
      </p>

      {workflowItems.length === 0 ? (
        <div
          className="rounded-dlc-md border border-dashed border-border/60 bg-dlc-surface-high/40 px-4 py-8 text-center"
          data-testid="pipeline-underwriting-workflow-empty"
        >
          <p className="text-sm font-medium text-foreground">
            No checklist steps yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Add a step or switch to a template to track broker-operational
            progression on this file.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 h-10 min-h-10"
            onClick={addStep}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add step
          </Button>
        </div>
      ) : (
        <ul
          className="divide-y divide-border/60 rounded-dlc-md border border-border/70 bg-background/60"
          data-testid="pipeline-underwriting-workflow-track"
          aria-label="Internal workflow milestones"
        >
          {workflowItems.map((item, index) => (
            <li
              key={item.id}
              className="flex min-h-10 items-center gap-1 px-1 py-0.5 sm:gap-2 sm:px-2"
              data-testid={`pipeline-underwriting-workflow-item-${index}`}
              data-workflow-step-id={item.id}
              data-workflow-done={item.done ? "true" : "false"}
            >
              <WorkflowCheckbox
                done={item.done}
                label={item.label}
                onToggle={() => toggleDone(item.id)}
              />
              <Input
                value={item.label}
                onChange={(e) => renameStep(item.id, e.target.value)}
                className={cn(
                  "h-10 min-h-10 min-w-0 flex-1 border-transparent bg-transparent px-2 shadow-none",
                  "focus-visible:border-border focus-visible:bg-background",
                  item.done && "text-muted-foreground line-through",
                )}
                aria-label={`Step ${index + 1} label`}
              />
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 min-h-10 px-0"
                  disabled={index === 0}
                  onClick={() => moveStep(item.id, -1)}
                  aria-label={`Move ${item.label} up`}
                >
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 min-h-10 px-0"
                  disabled={index === workflowItems.length - 1}
                  onClick={() => moveStep(item.id, 1)}
                  aria-label={`Move ${item.label} down`}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 min-h-10 px-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeStep(item.id)}
                  aria-label={`Remove ${item.label}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {workflowItems.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 min-h-10"
          onClick={addStep}
          data-testid="pipeline-underwriting-workflow-add-step"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add step
        </Button>
      ) : null}
    </div>
  );
}
