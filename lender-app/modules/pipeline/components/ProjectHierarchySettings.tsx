"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { withOperationalTimeout } from "@/lib/ui/operationalAsync";

type ProjectSettingsProps = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  projectId: Id<"projects">;
  clientId: Id<"clients">;
  title: string;
  compact?: boolean;
};

export function ProjectHierarchySettings({
  organizationId,
  memberUserKey,
  projectId,
  clientId,
  title,
  compact,
}: ProjectSettingsProps) {
  const { confirm } = useOperationalConfirm();
  const deleteStatus = useQuery(api.hierarchyCrudMutations.getProjectDeleteStatus, {
    organizationId,
    memberUserKey,
    projectId,
  });
  const clients = useQuery(api.pipelineHierarchyQueries.listClients, {
    organizationId,
    memberUserKey,
  });
  const patchProject = useMutation(api.hierarchyCrudMutations.patchProject);
  const deleteProject = useMutation(api.hierarchyCrudMutations.deleteProject);
  const changeProjectClient = useMutation(
    api.hierarchyCrudMutations.changeProjectClient,
  );

  const [projectTitle, setProjectTitle] = useState(title);
  const [selectedClientId, setSelectedClientId] = useState(String(clientId));
  const [confirmChangeClient, setConfirmChangeClient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!deleteStatus?.canDeleteOrReassign) return null;

  const fileCount = deleteStatus.fileCount ?? 0;
  const hasNested = deleteStatus.hasNestedChildren === true;
  const cascadeWarning =
    hasNested &&
    `This Project contains ${fileCount} active Loan File${fileCount === 1 ? "" : "s"}. Deleting it will permanently delete the project and all associated files.`;

  const onSaveTitle = async () => {
    const next = projectTitle.trim();
    if (!next || next === title) return;
    setSaving(true);
    try {
      await patchProject({
        organizationId,
        memberUserKey,
        projectId,
        title: next,
      });
    } finally {
      setSaving(false);
    }
  };

  const onChangeClient = async () => {
    setError(null);
    setBusy(true);
    try {
      await changeProjectClient({
        organizationId,
        memberUserKey,
        projectId,
        newClientId: selectedClientId as Id<"clients">,
      });
      setConfirmChangeClient(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openDeleteConfirm = () => {
    void confirm({
      variant: "delete",
      title: "Delete project",
      entityName: title,
      impact: "This permanently removes the project and its grouped loan files.",
      tertiary: cascadeWarning ? <span>{cascadeWarning}</span> : null,
      preview: {
        relationshipCounts: [{ label: "Loan files", count: fileCount }],
      },
      cascade: hasNested
        ? [
            {
              text: `${fileCount} loan file${fileCount === 1 ? "" : "s"} under this project will be permanently removed.`,
              tone: "attention",
            },
          ]
        : [{ text: "Only the project grouping will be removed." }],
      requireTypedConfirm: hasNested ? "DELETE" : undefined,
      testId: "project-hierarchy-delete-dialog",
      onConfirm: async () => {
        const result = await withOperationalTimeout(
          deleteProject({
            organizationId,
            memberUserKey,
            projectId,
            forceCascade: hasNested ? true : undefined,
          }),
          {
            timeoutMs: 25_000,
            message:
              "Delete is taking longer than expected. Check your connection, then try again.",
          },
        );
        if (!result.ok) throw new Error(result.message);
      },
    });
  };

  return (
    <div
      className={cn(
        "rounded-md border border-border/70 bg-background/80",
        compact ? "p-2" : "p-3",
      )}
      data-testid="project-hierarchy-settings"
    >
      {!compact ? (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Project settings
        </p>
      ) : null}
      <label className="mb-2 block text-xs text-muted-foreground">
        Title
        <Input
          className="mt-1 h-9"
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          onBlur={() => void onSaveTitle()}
          disabled={saving}
        />
      </label>
      <div className="mb-3 space-y-2" data-testid="change-project-client">
        <label className="block text-xs text-muted-foreground">
          Primary client
          <select
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            disabled={busy}
          >
            {(clients ?? []).map((c: { _id: Id<"clients">; displayName: string }) => (
              <option key={c._id} value={c._id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>
        {selectedClientId !== String(clientId) ? (
          confirmChangeClient ? (
            <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2">
              <p className="text-xs text-muted-foreground">
                Move this project to a different client? Graph edges will sync to the new
                primary client.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void onChangeClient()}
                >
                  {busy ? "Saving…" : "Confirm change client"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirmChangeClient(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmChangeClient(true)}
            >
              Change client
            </Button>
          )
        ) : null}
      </div>
      <div
        className="rounded-md border border-destructive/15 bg-destructive/[0.03] p-3"
        data-testid="project-delete-zone"
      >
        <p className="text-xs font-medium text-foreground">Delete project</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Permanently remove this project and its grouped loan files.
        </p>
        <Button
          type="button"
          variant="danger"
          size="sm"
          className="mt-3"
          onClick={openDeleteConfirm}
        >
          Delete project
        </Button>
      </div>
    </div>
  );
}
