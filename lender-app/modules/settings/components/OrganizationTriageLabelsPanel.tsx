"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Tag } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { OrgScopedConvexArgs } from "@/lib/useOrgConvexQueryArgs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TriageLabelCustomColorField } from "@/components/pipeline/tasks/triage/TriageLabelCustomColorField";
import { DEFAULT_TASK_COLOR_PRESETS } from "@/lib/taskColorPresets";
import { resolveTriageLabelSeverityWeight } from "@/lib/pipeline/triageSeverityWeight";
import { resolveTriageLabelHex } from "@/lib/triageLabelColor";

export function OrganizationTriageLabelsPanel({
  orgScope,
}: {
  orgScope: OrgScopedConvexArgs;
}) {
  const labels =
    useQuery(api.organizationTriageLabels.listTriageLabels, {
      organizationId: orgScope.organizationId,
      memberUserKey: orgScope.memberUserKey,
    }) ?? [];
  const colorPresets =
    useQuery(api.organizationSettings.getTaskColorPresets, {
      organizationId: orgScope.organizationId,
      memberUserKey: orgScope.memberUserKey,
    }) ?? DEFAULT_TASK_COLOR_PRESETS;

  const upsertLabel = useMutation(api.organizationTriageLabels.upsertTriageLabel);

  const [editingId, setEditingId] = useState<
    Id<"organizationTriageLabels"> | null
  >(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColorHex, setDraftColorHex] = useState(
    DEFAULT_TASK_COLOR_PRESETS[0]?.hexCode ?? "#64748B",
  );
  const [draftSeverityWeight, setDraftSeverityWeight] = useState("100");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const editingRow = useMemo(
    () => labels.find((row) => row._id === editingId) ?? null,
    [labels, editingId],
  );

  const startEdit = useCallback((row: Doc<"organizationTriageLabels">) => {
    setEditingId(row._id);
    setDraftLabel(row.label);
    setDraftColorHex(resolveTriageLabelHex(row, colorPresets));
    setDraftSeverityWeight(String(resolveTriageLabelSeverityWeight(row)));
    setMsg(null);
  }, [colorPresets]);

  const startCreate = useCallback(() => {
    setEditingId(null);
    setDraftLabel("");
    setDraftColorHex(DEFAULT_TASK_COLOR_PRESETS[0]?.hexCode ?? "#64748B");
    setDraftSeverityWeight("100");
    setMsg(null);
  }, []);

  const submit = useCallback(async () => {
    const label = draftLabel.trim();
    if (!label) {
      setMsg("Label text is required.");
      return;
    }
    const weight = Number.parseInt(draftSeverityWeight, 10);
    if (!Number.isFinite(weight) || weight <= 0) {
      setMsg("Severity weight must be a positive number.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await upsertLabel({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        labelId: editingId ?? undefined,
        label,
        colorId:
          editingRow?.colorId ??
          DEFAULT_TASK_COLOR_PRESETS[0]?.id ??
          "triage-urgent-red",
        customHexCode: draftColorHex,
        severityWeight: weight,
      });
      setMsg(editingId ? "Label updated." : "Label created.");
      startCreate();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }, [
    draftColorHex,
    draftLabel,
    draftSeverityWeight,
    editingId,
    editingRow?.colorId,
    orgScope.memberUserKey,
    orgScope.organizationId,
    startCreate,
    upsertLabel,
  ]);

  return (
    <div
      className="space-y-4 rounded-lg border border-border/80 bg-muted/10 p-4 sm:p-5"
      data-testid="organization-triage-labels-panel"
    >
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Tag className="h-4 w-4 text-muted-foreground" aria-hidden />
          Task triage labels
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Define labels your team can apply when adding file tasks (e.g. &quot;Ready
          for Funding&quot;, &quot;Client Waiting&quot;). Each label maps to one of
          a custom highlight color and appears in the pipeline task composer.
          Higher severity weight wins when multiple labeled tasks bubble to the
          same file, project, or client (e.g. Compliance Hold = 1000).
        </p>
      </div>

      <ul className="space-y-2">
        {labels.map((row) => {
          const hex = resolveTriageLabelHex(row, colorPresets);
          return (
            <li
              key={row._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-dlc-sm border border-border/60 bg-background px-3 py-2"
            >
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: hex }}
                  aria-hidden
                />
                {row.label}
                <span className="text-xs font-normal text-muted-foreground">
                  · {resolveTriageLabelSeverityWeight(row)}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => startEdit(row)}
              >
                Edit
              </Button>
            </li>
          );
        })}
        {labels.length === 0 ? (
          <li className="rounded-dlc-sm border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
            No triage labels yet. Create one below.
          </li>
        ) : null}
      </ul>

      <div className="space-y-3 rounded-dlc-md border border-border/60 bg-background p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {editingRow ? `Edit “${editingRow.label}”` : "New triage label"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Label</span>
            <Input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.currentTarget.value)}
              placeholder="Ready for Funding"
              className="min-h-10"
              data-testid="triage-label-name-input"
            />
          </label>
          <div className="sm:col-span-2">
            <TriageLabelCustomColorField
              valueHex={draftColorHex}
              onChangeHex={setDraftColorHex}
              presets={colorPresets}
              disabled={busy}
              testId="triage-label-color-select"
            />
          </div>
          <label className="space-y-1 text-xs sm:col-span-2">
            <span className="font-medium text-muted-foreground">
              Severity weight
            </span>
            <Input
              type="number"
              min={1}
              step={1}
              value={draftSeverityWeight}
              onChange={(e) => setDraftSeverityWeight(e.currentTarget.value)}
              className="min-h-10"
              data-testid="triage-label-severity-input"
            />
            <span className="block text-[11px] text-muted-foreground">
              Higher wins when multiple active labeled tasks compete on the same
              hub row.
            </span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy || !draftLabel.trim()}
            onClick={() => void submit()}
            data-testid="triage-label-save"
          >
            {busy ? "Saving…" : editingRow ? "Update label" : "Create label"}
          </Button>
          {editingRow ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={startCreate}
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
        {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      </div>
    </div>
  );
}
