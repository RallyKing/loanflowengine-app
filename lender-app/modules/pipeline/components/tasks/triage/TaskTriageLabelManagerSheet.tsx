"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Tag,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OperationalOverlayShell } from "@/components/ui/OperationalOverlayShell";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { TriageLabelCustomColorField } from "@/components/pipeline/tasks/triage/TriageLabelCustomColorField";
import { TriageSeverityEditor } from "@/components/pipeline/tasks/triage/TriageSeverityEditor";
import { useNarrowViewport } from "@/lib/useNarrowViewport";
import { DEFAULT_TASK_COLOR_PRESETS } from "@/lib/taskColorPresets";
import { resolveTriageLabelSeverityWeight } from "@/lib/pipeline/triageSeverityWeight";
import { resolveTriageLabelHex } from "@/lib/triageLabelColor";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { cn } from "@/lib/cn";

export type TaskTriageLabelManagerMode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; labelId: Id<"organizationTriageLabels"> };

export function TaskTriageLabelManagerSheet({
  open,
  onClose,
  organizationId,
  memberUserKey,
  initialMode = { kind: "list" },
  onLabelCreated,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  initialMode?: TaskTriageLabelManagerMode;
  onLabelCreated?: (labelId: Id<"organizationTriageLabels">) => void;
}) {
  const narrow = useNarrowViewport();
  const { confirm } = useOperationalConfirm();

  const labels =
    useQuery(api.organizationTriageLabels.listTriageLabels, {
      organizationId,
      memberUserKey,
    }) ?? [];
  const colorPresets =
    useQuery(api.organizationSettings.getTaskColorPresets, {
      organizationId,
      memberUserKey,
    }) ?? DEFAULT_TASK_COLOR_PRESETS;

  const upsertLabel = useMutation(api.organizationTriageLabels.upsertTriageLabel);
  const archiveLabel = useMutation(api.organizationTriageLabels.archiveTriageLabel);
  const reorderLabels = useMutation(api.organizationTriageLabels.reorderTriageLabels);

  const [mode, setMode] = useState<TaskTriageLabelManagerMode>(initialMode);
  const [draftName, setDraftName] = useState("");
  const [draftColorHex, setDraftColorHex] = useState(
    DEFAULT_TASK_COLOR_PRESETS[0]?.hexCode ?? "#64748B",
  );
  const [draftSeverity, setDraftSeverity] = useState(100);
  const [busy, setBusy] = useState(false);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
  }, [open, initialMode]);

  const editingRow = useMemo(() => {
    if (mode.kind !== "edit") return null;
    return labels.find((row) => row._id === mode.labelId) ?? null;
  }, [labels, mode]);

  const startCreate = useCallback(() => {
    setMode({ kind: "create" });
    setDraftName("");
    setDraftColorHex(DEFAULT_TASK_COLOR_PRESETS[0]?.hexCode ?? "#64748B");
    setDraftSeverity(100);
  }, []);

  const startEdit = useCallback(
    (row: Doc<"organizationTriageLabels">) => {
    setMode({ kind: "edit", labelId: row._id });
    setDraftName(row.label);
    setDraftColorHex(resolveTriageLabelHex(row, colorPresets));
    setDraftSeverity(resolveTriageLabelSeverityWeight(row));
    },
    [colorPresets],
  );

  useEffect(() => {
    if (!open) return;
    if (mode.kind === "create") return;
    if (mode.kind === "edit" && editingRow) {
      setDraftName(editingRow.label);
      setDraftColorHex(resolveTriageLabelHex(editingRow, colorPresets));
      setDraftSeverity(resolveTriageLabelSeverityWeight(editingRow));
    }
  }, [open, mode, editingRow, colorPresets]);

  const saveDraft = async () => {
    const name = draftName.trim();
    if (!name) {
      showOperationalToast({
        title: "Label name required",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const result = await upsertLabel({
        organizationId,
        memberUserKey,
        labelId: mode.kind === "edit" ? mode.labelId : undefined,
        label: name,
        colorId:
          mode.kind === "edit" && editingRow
            ? editingRow.colorId
            : DEFAULT_TASK_COLOR_PRESETS[0]?.id ?? "triage-urgent-red",
        customHexCode: draftColorHex,
        severityWeight: draftSeverity,
      });
      showOperationalToast({
        title: mode.kind === "edit" ? "Label updated" : "Label created",
        description: name,
        variant: "success",
      });
      if (mode.kind === "create" && result.id) {
        onLabelCreated?.(result.id);
      }
      setMode({ kind: "list" });
    } catch (error) {
      showOperationalToast({
        title: "Could not save label",
        description: error instanceof Error ? error.message : "Save failed.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (row: Doc<"organizationTriageLabels">) => {
    const ok = await confirm({
      variant: "archive",
      title: "Archive triage label",
      entityName: row.label,
      impact:
        "The label will be hidden from the composer. Existing task assignments stay until cleared.",
      confirmLabel: "Archive label",
      onConfirm: async () => {
        await archiveLabel({
          organizationId,
          memberUserKey,
          labelId: row._id,
        });
      },
    });
    if (ok && mode.kind === "edit" && mode.labelId === row._id) {
      setMode({ kind: "list" });
    }
  };

  const moveLabel = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= labels.length) return;
    const ordered = labels.map((row) => row._id);
    const [removed] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, removed);
    setReordering(true);
    try {
      await reorderLabels({
        organizationId,
        memberUserKey,
        orderedLabelIds: ordered,
      });
    } catch (error) {
      showOperationalToast({
        title: "Could not reorder",
        description: error instanceof Error ? error.message : "Reorder failed.",
        variant: "destructive",
      });
    } finally {
      setReordering(false);
    }
  };

  const showForm = mode.kind === "create" || mode.kind === "edit";

  return (
    <OperationalOverlayShell
      open={open}
      onClose={onClose}
      align={narrow ? "bottom-sheet" : "center"}
      aria-labelledby="task-triage-label-manager-title"
      data-testid="task-triage-label-manager-sheet"
      panelClassName={cn(
        // Cap to viewport; min-h-0 so the flex child can shrink and own list scroll.
        "flex max-h-[min(90dvh,720px)] min-h-0 w-full max-w-lg flex-col overflow-hidden p-0",
        narrow && "rounded-b-none sm:rounded-b-dlc-lg",
      )}
    >
      <header className="shrink-0 border-b border-border/60 px-4 py-3 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="task-triage-label-manager-title"
              className="flex items-center gap-2 text-base font-semibold text-foreground"
            >
              <Tag className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              Triage labels
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Manage labels without leaving this file.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-10 shrink-0"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </header>

      {showForm ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:px-5 sm:py-3">
          <div className="space-y-4" data-testid="triage-label-form">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {mode.kind === "edit" ? "Edit label" : "New label"}
            </p>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">Name</span>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.currentTarget.value)}
                placeholder="Compliance Hold"
                className="min-h-10"
                disabled={busy}
                data-testid="inline-triage-label-name"
              />
            </label>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Color
              </span>
              <TriageLabelCustomColorField
                valueHex={draftColorHex}
                onChangeHex={setDraftColorHex}
                presets={colorPresets}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Severity
              </span>
              <TriageSeverityEditor
                value={draftSeverity}
                onChange={setDraftSeverity}
                disabled={busy}
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                className="min-h-10"
                disabled={busy || !draftName.trim()}
                onClick={() => void saveDraft()}
                data-testid="inline-triage-label-save"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : mode.kind === "edit" ? (
                  "Save changes"
                ) : (
                  "Create label"
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-10"
                disabled={busy}
                onClick={() => setMode({ kind: "list" })}
              >
                Back to list
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/40 px-4 py-2.5 sm:px-5">
            <p className="text-xs text-muted-foreground">
              {labels.length} label{labels.length === 1 ? "" : "s"}
            </p>
            <Button
              type="button"
              size="sm"
              className="min-h-10 gap-1.5"
              onClick={startCreate}
              data-testid="inline-triage-new-label"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New label
            </Button>
          </div>

          <ul
            className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-4 py-2.5 sm:px-5"
            data-testid="triage-label-manager-list"
          >
            {labels.map((row, index) => {
              const hex = resolveTriageLabelHex(row, colorPresets);
              return (
                <li
                  key={row._id}
                  className="flex items-center gap-1.5 rounded-dlc-md border border-border/60 bg-dlc-surface px-2 py-1.5"
                >
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
                      disabled={reordering || index === 0}
                      aria-label="Move up"
                      onClick={() => void moveLabel(index, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
                      disabled={reordering || index === labels.length - 1}
                      aria-label="Move down"
                      onClick={() => void moveLabel(index, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="min-h-10 min-w-0 flex-1 text-left"
                    onClick={() => startEdit(row)}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: hex }}
                        aria-hidden
                      />
                      <span className="truncate">{row.label}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {resolveTriageLabelSeverityWeight(row)}
                      </span>
                    </span>
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10 shrink-0 px-0 text-muted-foreground"
                    aria-label={`Archive ${row.label}`}
                    onClick={() => void handleArchive(row)}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
            {labels.length === 0 ? (
              <li className="rounded-dlc-md border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
                No labels yet. Create one to start triage bubbling on this
                file.
              </li>
            ) : null}
          </ul>
        </>
      )}
    </OperationalOverlayShell>
  );
}
