"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrgMemberQueryArgs } from "@/lib/convex/useStableConvexArgs";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Settings2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  OperationalAnchoredPanel,
  OperationalOverlayShell,
} from "@/components/ui/OperationalOverlayShell";
import { TriageLabelCustomColorField } from "@/components/pipeline/tasks/triage/TriageLabelCustomColorField";
import { TriageLabelPillEditor } from "@/components/pipeline/tasks/triage/TriageLabelPillEditor";
import { TriageSeverityEditor } from "@/components/pipeline/tasks/triage/TriageSeverityEditor";
import { useNarrowViewport } from "@/lib/useNarrowViewport";
import { DEFAULT_TASK_COLOR_PRESETS } from "@/lib/taskColorPresets";
import { buildTriageLabelsMap } from "@/lib/inFileTaskTriageUi";
import { resolveTriageLabelSeverityWeight } from "@/lib/pipeline/triageSeverityWeight";
import { resolveTriageLabelHex } from "@/lib/triageLabelColor";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { cn } from "@/lib/cn";

function QuickEditPanelBody({
  task,
  organizationId,
  memberUserKey,
  onClose,
  onOpenManager,
  onPatchTask,
}: {
  task: Doc<"tasks">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  onClose: () => void;
  onOpenManager: (labelId?: Id<"organizationTriageLabels">) => void;
  onPatchTask: (
    task: Doc<"tasks">,
    patch: { triageLabelId: Id<"organizationTriageLabels"> | null },
  ) => Promise<void>;
}) {
  const orgMemberArgs = useOrgMemberQueryArgs(organizationId, memberUserKey);

  const labels =
    useQuery(api.organizationTriageLabels.listTriageLabels, orgMemberArgs) ?? [];
  const colorPresets =
    useQuery(api.organizationSettings.getTaskColorPresets, orgMemberArgs) ??
    DEFAULT_TASK_COLOR_PRESETS;

  const upsertLabel = useMutation(api.organizationTriageLabels.upsertTriageLabel);
  const labelsById = useMemo(() => buildTriageLabelsMap(labels), [labels]);

  const currentLabel = task.triageLabelId
    ? labelsById.get(String(task.triageLabelId))
    : undefined;

  const [editingSeverity, setEditingSeverity] = useState(false);
  const [editingColor, setEditingColor] = useState(false);
  const [severityDraft, setSeverityDraft] = useState(100);
  const [colorDraftHex, setColorDraftHex] = useState(
    DEFAULT_TASK_COLOR_PRESETS[0]?.hexCode ?? "#64748B",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (currentLabel) {
      setSeverityDraft(resolveTriageLabelSeverityWeight(currentLabel));
      setColorDraftHex(resolveTriageLabelHex(currentLabel, colorPresets));
    }
  }, [currentLabel]);

  const assignLabel = async (labelId: Id<"organizationTriageLabels"> | null) => {
    setBusy(true);
    try {
      await onPatchTask(task, { triageLabelId: labelId });
      onClose();
    } catch (error) {
      showOperationalToast({
        title: "Could not update task",
        description: error instanceof Error ? error.message : "Update failed.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const saveSeverity = async () => {
    if (!task.triageLabelId || !currentLabel) return;
    setBusy(true);
    try {
      await upsertLabel({
        organizationId,
        memberUserKey,
        labelId: task.triageLabelId,
        label: currentLabel.label,
        colorId: currentLabel.colorId,
        customHexCode: currentLabel.customHexCode,
        severityWeight: severityDraft,
      });
      showOperationalToast({
        title: "Severity updated",
        description: currentLabel.label,
        variant: "success",
      });
      setEditingSeverity(false);
    } catch (error) {
      showOperationalToast({
        title: "Could not update severity",
        description: error instanceof Error ? error.message : "Save failed.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const saveColor = async () => {
    if (!task.triageLabelId || !currentLabel) return;
    setBusy(true);
    try {
      await upsertLabel({
        organizationId,
        memberUserKey,
        labelId: task.triageLabelId,
        label: currentLabel.label,
        colorId: currentLabel.colorId,
        customHexCode: colorDraftHex,
        severityWeight: resolveTriageLabelSeverityWeight(currentLabel),
      });
      showOperationalToast({
        title: "Label color updated",
        description: currentLabel.label,
        variant: "success",
      });
      setEditingColor(false);
    } catch (error) {
      showOperationalToast({
        title: "Could not update color",
        description: error instanceof Error ? error.message : "Save failed.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 p-3" data-testid="task-triage-quick-edit">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Task label
        </p>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/50"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="truncate text-sm font-medium text-foreground">{task.title}</p>

      {editingSeverity && currentLabel ? (
        <div className="space-y-2 rounded-dlc-sm border border-border/60 bg-muted/10 p-2">
          <p className="text-xs font-medium text-foreground">
            Severity — {currentLabel.label}
          </p>
          <TriageSeverityEditor
            value={severityDraft}
            onChange={setSeverityDraft}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void saveSeverity()}
            >
              {busy ? "Saving…" : "Save severity"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setEditingSeverity(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : editingColor && currentLabel ? (
        <div
          className="space-y-2 rounded-dlc-sm border border-border/60 bg-muted/10 p-2"
          data-testid="task-triage-quick-edit-color"
        >
          <p className="text-xs font-medium text-foreground">
            Color — {currentLabel.label}
          </p>
          <TriageLabelCustomColorField
            valueHex={colorDraftHex}
            onChangeHex={setColorDraftHex}
            presets={colorPresets}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void saveColor()}
            >
              {busy ? "Saving…" : "Save color"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setEditingColor(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className={cn(
                "min-h-9 rounded-full border px-3 text-xs font-medium",
                !task.triageLabelId
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
              onClick={() => void assignLabel(null)}
            >
              No label
            </button>
            {labels.map((label) => {
              const hex = resolveTriageLabelHex(label, colorPresets);
              const selected = task.triageLabelId === label._id;
              return (
                <TriageLabelPillEditor
                  key={label._id}
                  label={label.label}
                  hex={hex}
                  selected={selected}
                  disabled={busy}
                  onClick={() => void assignLabel(label._id)}
                  testId={`quick-edit-label-${label._id}`}
                  labelAppliedAt={selected ? task.labelAppliedAt : undefined}
                />
              );
            })}
          </div>

          {currentLabel ? (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9 w-full"
                disabled={busy}
                onClick={() => {
                  setEditingColor(false);
                  setEditingSeverity(true);
                }}
              >
                Edit severity ({resolveTriageLabelSeverityWeight(currentLabel)})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9 w-full"
                disabled={busy}
                onClick={() => {
                  setEditingSeverity(false);
                  setEditingColor(true);
                }}
                data-testid="task-triage-quick-edit-color-open"
              >
                Edit label color
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="min-h-9 w-full gap-1.5"
        disabled={busy}
        onClick={() => {
          onClose();
          onOpenManager(task.triageLabelId ?? undefined);
        }}
      >
        <Settings2 className="h-3.5 w-3.5" aria-hidden />
        Manage all labels
      </Button>

      {busy ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Updating…
        </p>
      ) : null}
    </div>
  );
}

/** Desktop popover or mobile sheet for swapping / clearing task labels. */
export function TaskTriageQuickEditPopover({
  open,
  onClose,
  anchorEl,
  task,
  organizationId,
  memberUserKey,
  onOpenManager,
  onPatchTask,
}: {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  task: Doc<"tasks"> | null;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  onOpenManager: (labelId?: Id<"organizationTriageLabels">) => void;
  onPatchTask: (
    task: Doc<"tasks">,
    patch: { triageLabelId: Id<"organizationTriageLabels"> | null },
  ) => Promise<void>;
}) {
  const narrow = useNarrowViewport();
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!anchorEl || narrow) return;
    const rect = anchorEl.getBoundingClientRect();
    const width = 320;
    let left = rect.left;
    if (left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }
    setPosition({
      top: rect.bottom + 8,
      left: Math.max(12, left),
    });
  }, [anchorEl, narrow]);

  useEffect(() => {
    if (!open || narrow) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, narrow, updatePosition]);

  useEffect(() => {
    if (!open || narrow) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open, narrow, onClose, anchorEl]);

  if (!open || !task || !organizationId || !memberUserKey) return null;

  const body = (
    <QuickEditPanelBody
      task={task}
      organizationId={organizationId}
      memberUserKey={memberUserKey}
      onClose={onClose}
      onOpenManager={onOpenManager}
      onPatchTask={onPatchTask}
    />
  );

  if (narrow) {
    return (
      <OperationalOverlayShell
        open={open}
        onClose={onClose}
        align="bottom-sheet"
        aria-label="Edit task label"
        data-testid="task-triage-quick-edit-sheet"
        panelClassName="w-full max-w-lg p-0"
      >
        {body}
      </OperationalOverlayShell>
    );
  }

  if (!mounted || !position) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: position.top, left: position.left, zIndex: 50 }}
    >
      <OperationalAnchoredPanel
        className="w-80 overflow-hidden rounded-dlc-md border border-border/80 shadow-dlc-2"
        aria-label="Edit task label"
        data-testid="task-triage-quick-edit-popover"
      >
        {body}
      </OperationalAnchoredPanel>
    </div>,
    document.body,
  );
}
