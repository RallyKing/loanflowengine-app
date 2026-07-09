"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  ActionSuite,
  ActionSuiteIconButton,
  ActionSuiteModal,
} from "@/components/ui/ActionSuite";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { traceDeleteExecution } from "@/lib/ui/deleteExecutionTrace";
import { withOperationalTimeout } from "@/lib/ui/operationalAsync";
import type { OperationalConfirmCascadeItem } from "@/lib/ui/operationalConfirm";

export function HubHierarchyClientActions({
  organizationId,
  memberUserKey,
  hubClientKey,
  displayName,
  onAddProject,
}: {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  hubClientKey: string;
  displayName: string;
  onAddProject?: () => void;
}) {
  const { confirm } = useOperationalConfirm();
  const deleteStatus = useQuery(api.hierarchyCrudMutations.getHubClientDeleteStatus, {
    organizationId,
    memberUserKey,
    hubClientKey,
  });
  const patchHubClient = useMutation(api.hierarchyCrudMutations.patchHubClient);
  const deleteHubClient = useMutation(api.hierarchyCrudMutations.deleteHubClient);

  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(displayName);
  }, [displayName]);

  const canMutate = deleteStatus?.canDeleteOrReassign === true;
  const deleteBlockedMessage = deleteStatus?.blockMessage ?? null;
  const projectCount = deleteStatus?.projectCount ?? 0;
  const loanFileCount = deleteStatus?.loanFileCount ?? 0;
  const hasNested = deleteStatus?.hasNestedChildren === true;

  const onSaveRename = async () => {
    const next = name.trim();
    if (!next || next === displayName) {
      setRenameOpen(false);
      return;
    }
    setSaving(true);
    try {
      await patchHubClient({
        organizationId,
        memberUserKey,
        hubClientKey,
        displayName: next,
      });
      setRenameOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = () => {
    const key = String(hubClientKey ?? "").trim();
    if (!key) return;

    const cascade: OperationalConfirmCascadeItem[] = hasNested
      ? [
          {
            text: `${projectCount} project${projectCount === 1 ? "" : "s"} and ${loanFileCount} loan file${loanFileCount === 1 ? "" : "s"} will be permanently removed.`,
            tone: "attention",
          },
          {
            text: "Tasks and activity linked only through this client may lose hub context.",
          },
        ]
      : [
          {
            text: "No nested projects or loan files — only this client record is removed.",
          },
        ];

    void (async () => {
      traceDeleteExecution("hub_client_delete", "modal_open", { hubClientKey: key });
      await confirm({
        variant: "delete",
        title: "Delete client",
        entityName: displayName,
        impact: "This permanently removes the client and all data grouped under it.",
        tertiary: deleteBlockedMessage ? <span>{deleteBlockedMessage}</span> : null,
        preview: {
          relationshipCounts: [
            { label: "Projects", count: projectCount },
            { label: "Loan files", count: loanFileCount },
          ],
        },
        cascade,
        requireTypedConfirm: hasNested ? "DELETE" : undefined,
        testId: "hub-client-delete-modal",
        onConfirm: async () => {
          traceDeleteExecution("hub_client_delete", "mutation_start", { hubClientKey: key });
          traceDeleteExecution("hub_client_delete", "mutation_dispatched");
          const result = await withOperationalTimeout(
            deleteHubClient({
              organizationId,
              memberUserKey,
              hubClientKey: key,
              forceCascade: hasNested ? true : undefined,
            }),
            {
              timeoutMs: 25_000,
              message:
                "Delete is taking longer than expected. Check your connection, then try again.",
            },
          );
          if (!result.ok) {
            traceDeleteExecution("hub_client_delete", "timeout_triggered", {
              message: result.message,
            });
            throw new Error(result.message);
          }
          traceDeleteExecution("hub_client_delete", "mutation_resolved");
          traceDeleteExecution("hub_client_delete", "mutation_success");
          traceDeleteExecution("hub_client_delete", "overlay_dismissed");
        },
      });
    })();
  };

  const actionsDisabled = deleteStatus != null && !canMutate;

  return (
    <>
      <ActionSuite data-testid="hub-client-row-actions">
        <ActionSuiteIconButton
          testId="hub-client-rename"
          tooltip={`Rename ${displayName}`}
          disabled={actionsDisabled}
          onClick={() => setRenameOpen(true)}
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </ActionSuiteIconButton>
        <ActionSuiteIconButton
          testId="hub-client-delete"
          tooltip="Permanently Delete and Cascade Wipe This Client"
          destructive
          disabled={actionsDisabled}
          onClick={openDeleteConfirm}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </ActionSuiteIconButton>
        {onAddProject ? (
          <ActionSuiteIconButton
            testId="hub-add-project"
            tooltip="Add New Project Under This Parent"
            onClick={() => onAddProject()}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </ActionSuiteIconButton>
        ) : null}
      </ActionSuite>

      {renameOpen ? (
        <ActionSuiteModal
          testId="hub-client-rename-modal"
          title="Rename client"
          onClose={() => setRenameOpen(false)}
        >
          <label className="block text-xs text-muted-foreground">
            Display name
            <Input
              className="mt-1 h-9"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={saving}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSaveRename();
              }}
            />
          </label>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => setRenameOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving || !name.trim()}
              onClick={() => void onSaveRename()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </ActionSuiteModal>
      ) : null}
    </>
  );
}

export function HubHierarchyProjectActions({
  organizationId,
  memberUserKey,
  hubProjectKey,
  title,
  onAddLoanFile,
}: {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  hubProjectKey: string;
  title: string;
  onAddLoanFile?: () => void;
}) {
  const { confirm } = useOperationalConfirm();
  const deleteStatus = useQuery(api.hierarchyCrudMutations.getHubProjectDeleteStatus, {
    organizationId,
    memberUserKey,
    hubProjectKey,
  });
  const patchHubProject = useMutation(api.hierarchyCrudMutations.patchHubProject);
  const deleteHubProject = useMutation(api.hierarchyCrudMutations.deleteHubProject);

  const [renameOpen, setRenameOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState(title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProjectTitle(title);
  }, [title]);

  const canMutate = deleteStatus?.canDeleteOrReassign === true;
  const deleteBlockedMessage = deleteStatus?.blockMessage ?? null;
  const fileCount = deleteStatus?.fileCount ?? 0;
  const hasNested = deleteStatus?.hasNestedChildren === true;

  const onSaveRename = async () => {
    const next = projectTitle.trim();
    if (!next || next === title) {
      setRenameOpen(false);
      return;
    }
    setSaving(true);
    try {
      await patchHubProject({
        organizationId,
        memberUserKey,
        hubProjectKey,
        title: next,
      });
      setRenameOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = () => {
    const key = String(hubProjectKey ?? "").trim();
    if (!key) return;

    const cascade: OperationalConfirmCascadeItem[] = hasNested
      ? [
          {
            text: `${fileCount} loan file${fileCount === 1 ? "" : "s"} will be permanently removed.`,
            tone: "attention",
          },
        ]
      : [
          {
            text: "No nested loan files — only this project record is removed.",
          },
        ];

    void (async () => {
      traceDeleteExecution("hub_project_delete", "modal_open", { hubProjectKey: key });
      await confirm({
        variant: "delete",
        title: "Delete project",
        entityName: title,
        impact: "This permanently removes the project and its grouped loan files.",
        tertiary: deleteBlockedMessage ? <span>{deleteBlockedMessage}</span> : null,
        preview: {
          relationshipCounts: [{ label: "Loan files", count: fileCount }],
        },
        cascade,
        requireTypedConfirm: hasNested ? "DELETE" : undefined,
        testId: "hub-project-delete-modal",
        onConfirm: async () => {
          traceDeleteExecution("hub_project_delete", "mutation_start", { hubProjectKey: key });
          traceDeleteExecution("hub_project_delete", "mutation_dispatched");
          const result = await withOperationalTimeout(
            deleteHubProject({
              organizationId,
              memberUserKey,
              hubProjectKey: key,
              forceCascade: hasNested ? true : undefined,
            }),
            {
              timeoutMs: 25_000,
              message:
                "Delete is taking longer than expected. Check your connection, then try again.",
            },
          );
          if (!result.ok) {
            traceDeleteExecution("hub_project_delete", "timeout_triggered", {
              message: result.message,
            });
            throw new Error(result.message);
          }
          traceDeleteExecution("hub_project_delete", "mutation_resolved");
          traceDeleteExecution("hub_project_delete", "mutation_success");
          traceDeleteExecution("hub_project_delete", "overlay_dismissed");
        },
      });
    })();
  };

  const actionsDisabled = deleteStatus != null && !canMutate;

  return (
    <>
      <ActionSuite data-testid="hub-project-row-actions">
        <ActionSuiteIconButton
          testId="hub-project-rename"
          tooltip={`Rename ${title}`}
          disabled={actionsDisabled}
          onClick={() => setRenameOpen(true)}
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </ActionSuiteIconButton>
        <ActionSuiteIconButton
          testId="hub-project-delete"
          tooltip="Permanently Delete and Cascade Wipe This Project"
          destructive
          disabled={actionsDisabled}
          onClick={openDeleteConfirm}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </ActionSuiteIconButton>
        {onAddLoanFile ? (
          <ActionSuiteIconButton
            testId="hub-add-loan-file"
            tooltip="Add New Loan File Under This Parent"
            onClick={() => onAddLoanFile()}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </ActionSuiteIconButton>
        ) : null}
      </ActionSuite>

      {renameOpen ? (
        <ActionSuiteModal
          testId="hub-project-rename-modal"
          title="Rename project"
          onClose={() => setRenameOpen(false)}
        >
          <label className="block text-xs text-muted-foreground">
            Project title
            <Input
              className="mt-1 h-9"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              autoFocus
              disabled={saving}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSaveRename();
              }}
            />
          </label>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => setRenameOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving || !projectTitle.trim()}
              onClick={() => void onSaveRename()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </ActionSuiteModal>
      ) : null}
    </>
  );
}
