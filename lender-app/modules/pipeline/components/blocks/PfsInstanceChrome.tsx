"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { ReoContactMultiAssign } from "@/components/intake/reo/ReoContactMultiAssign";
import { ScheduleCopyToFileDialog } from "@/components/schedule/ScheduleCopyToFileDialog";
import { cn } from "@/lib/cn";
import {
  computePersonalFinancialStatement,
  formatPfsMoney,
} from "@/lib/pfs/personalFinancialStatementModel";
import { pfsAssociatedFormTitle } from "@/lib/pfs/pfsFormAssociation";
import {
  pfsInstanceDisplayName,
  pfsInstanceIsFilled,
  type PfsInstance,
} from "@/lib/pfs/pfsInstances";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export function PfsInstanceChrome({
  instances,
  activeId,
  selectedIds,
  fileId,
  organizationId,
  memberUserKey,
  readOnly,
  onSelect,
  onToggleSelected,
  onCreate,
  onRename,
  onAssignContacts,
  onRemove,
  onVaultTaskReady,
}: {
  instances: readonly PfsInstance[];
  activeId: string;
  selectedIds: readonly string[];
  fileId: Id<"pipeline">;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  readOnly?: boolean;
  onSelect: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onAssignContacts: (id: string, contactIds: string[]) => void;
  onRemove: (id: string) => void;
  onVaultTaskReady?: (id: string, vaultFileTaskId: string) => void;
}) {
  const [copyOpen, setCopyOpen] = useState(false);
  const [passwordForId, setPasswordForId] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const vaultTasks = useQuery(
    api.documentVaultFileTasks.listByPipeline,
    memberUserKey
      ? { pipelineFileId: fileId, memberUserKey }
      : { pipelineFileId: fileId },
  );
  const ensureVaultTask = useMutation(
    api.documentVaultFileTasks.ensurePfsInstanceVaultTask,
  );
  const setTaskPassword = useMutation(
    api.documentVaultFileTasks.setFileTaskAccessPassword,
  );
  const clearTaskPassword = useMutation(
    api.documentVaultFileTasks.clearFileTaskAccessPassword,
  );
  const copyPfs = useMutation(api.pipelineContacts.copyPfsToFile);

  const taskById = useMemo(() => {
    type VaultTaskRow = NonNullable<typeof vaultTasks>[number];
    const map = new Map<string, VaultTaskRow>();
    for (const task of vaultTasks ?? []) {
      map.set(String(task._id), task);
    }
    return map;
  }, [vaultTasks]);

  const selectedIndexes = useMemo(
    () =>
      instances
        .map((inst, index) =>
          selectedIds.includes(inst.id) ? index : -1,
        )
        .filter((i) => i >= 0),
    [instances, selectedIds],
  );

  const passwordTarget = instances.find((inst) => inst.id === passwordForId);

  return (
    <div className="space-y-3" data-testid="pfs-instance-chrome">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Personal financial statements
        </p>
        {!readOnly ? (
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-10"
              data-testid="pfs-create-instance"
              onClick={onCreate}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New PFS
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-10"
              data-testid="pfs-copy-to-file"
              onClick={() => setCopyOpen(true)}
            >
              <Copy className="h-4 w-4" aria-hidden />
              Bring into another file
            </Button>
          </div>
        ) : null}
      </div>

      <ul className="space-y-2">
        {instances.map((inst) => {
          const computed = computePersonalFinancialStatement(inst.data);
          const filled = pfsInstanceIsFilled(inst);
          const task = inst.vaultFileTaskId
            ? taskById.get(inst.vaultFileTaskId)
            : undefined;
          const locked = Boolean(
            (task as { passwordProtected?: boolean } | undefined)
              ?.passwordProtected,
          );
          const active = inst.id === activeId;
          const selected = selectedIds.includes(inst.id);
          return (
            <li
              key={inst.id}
              className={cn(
                "rounded-dlc-md border bg-dlc-surface p-2.5",
                active
                  ? "border-primary/40 ring-1 ring-primary/20"
                  : "border-border/70",
              )}
            >
              <div className="flex min-w-0 items-start gap-2">
                {!readOnly ? (
                  <input
                    type="checkbox"
                    className="mt-2 h-4 w-4 shrink-0"
                    checked={selected}
                    aria-label={`Select ${pfsInstanceDisplayName(inst)}`}
                    onChange={() => onToggleSelected(inst.id)}
                  />
                ) : null}
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelect(inst.id)}
                  data-testid={`pfs-instance-${inst.id}`}
                >
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {pfsInstanceDisplayName(inst)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {filled
                      ? `Net worth ${formatPfsMoney(computed.netWorth)}`
                      : "Draft"}
                    {task
                      ? ` · ${task.title}`
                      : inst.intakeFormId
                        ? " · Form linked"
                        : ""}
                    {locked ? " · Locked" : ""}
                  </span>
                </button>
                {locked ? (
                  <Lock
                    className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-label="Password protected"
                  />
                ) : null}
              </div>

              {!readOnly ? (
                <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
                  <label className="block">
                    <span className="sr-only">PFS label</span>
                    <Input
                      value={inst.name}
                      onChange={(e) => onRename(inst.id, e.target.value)}
                      placeholder="Borrower name / label"
                      className="h-10 min-h-[40px]"
                      aria-label="PFS label"
                    />
                  </label>
                  <ReoContactMultiAssign
                    selectedIds={inst.assignedContactIds ?? []}
                    onChange={(ids) => onAssignContacts(inst.id, ids)}
                    organizationId={organizationId}
                    memberUserKey={memberUserKey}
                    fileId={fileId}
                    label="Assign contacts"
                    compact
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-10"
                      data-testid={`pfs-vault-task-${inst.id}`}
                      onClick={() => {
                        void (async () => {
                          try {
                            const result = await ensureVaultTask({
                              pipelineFileId: fileId,
                              pfsInstanceId: inst.id,
                              memberUserKey,
                              assignedContactId: inst.assignedContactIds?.[0]
                                ? (inst.assignedContactIds[0] as Id<"contacts">)
                                : undefined,
                              title: pfsAssociatedFormTitle(inst),
                            });
                            onVaultTaskReady?.(
                              inst.id,
                              String(result.fileTaskId),
                            );
                            showOperationalToast({
                              title: result.created
                                ? "Vault task created"
                                : "Vault task ready",
                              description: `"${result.title}" is in Document Vault.`,
                              variant: "success",
                            });
                          } catch (e) {
                            showOperationalToast({
                              title: "Could not create vault task",
                              description:
                                e instanceof Error ? e.message : "Try again.",
                              variant: "destructive",
                            });
                          }
                        })();
                      }}
                    >
                      Vault task
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-10"
                      data-testid={`pfs-password-${inst.id}`}
                      onClick={() => {
                        setPasswordForId(inst.id);
                        setPasswordValue("");
                      }}
                    >
                      {locked ? (
                        <Lock className="h-4 w-4" aria-hidden />
                      ) : (
                        <LockOpen className="h-4 w-4" aria-hidden />
                      )}
                      {locked ? "Change password" : "Set password"}
                    </Button>
                    {instances.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-10 text-destructive"
                        aria-label={`Delete ${pfsInstanceDisplayName(inst)}`}
                        onClick={() => onRemove(inst.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <ScheduleCopyToFileDialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        sourceFileId={fileId}
        memberUserKey={memberUserKey}
        selectedRowIndexes={selectedIndexes}
        defaultMode={selectedIndexes.length > 0 ? "rows" : "block"}
        title="Bring PFS into another file"
        description="Copy selected personal financial statements or all of them into another loan file. Assigned contacts travel with each PFS."
        rowNounSingular="PFS"
        rowNounPlural="PFSs"
        testId="pfs-copy-to-file-dialog"
        onCopy={async ({ targetFileId, mode, rowIndexes }) => {
          const result = await copyPfs({
            sourceFileId: fileId,
            targetFileId,
            mode,
            ...(mode === "rows" ? { rowIndexes } : {}),
            ...(memberUserKey ? { preferencesAccountId: memberUserKey } : {}),
          });
          if (!result.ok) return { ok: false as const };
          return {
            ok: true as const,
            copiedRowCount: result.copiedRowCount,
          };
        }}
      />

      <OverlayShell
        open={Boolean(passwordTarget)}
        onClose={() => {
          setPasswordForId(null);
          setPasswordValue("");
        }}
        align="bottom-sheet"
        aria-label="Set PFS password"
        panelClassName="w-full max-w-md p-4"
        data-testid="pfs-password-dialog"
      >
        <h3 className="text-sm font-semibold text-foreground">
          Password protect this PFS
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Borrowers share the same portal link. Only the person with this
          password can open and complete{" "}
          {passwordTarget ? pfsInstanceDisplayName(passwordTarget) : "this PFS"}.
          Use any password you choose (for example the borrower’s SSN).
        </p>
        <Input
          type="password"
          autoComplete="new-password"
          className="mt-3 h-10 min-h-[40px]"
          value={passwordValue}
          onChange={(e) => setPasswordValue(e.target.value)}
          placeholder="Password"
          data-testid="pfs-password-input"
        />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {passwordTarget?.vaultFileTaskId &&
          (
            taskById.get(passwordTarget.vaultFileTaskId) as
              | { passwordProtected?: boolean }
              | undefined
          )?.passwordProtected ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={passwordBusy}
              onClick={() => {
                if (!passwordTarget.vaultFileTaskId) return;
                setPasswordBusy(true);
                void clearTaskPassword({
                  fileTaskId:
                    passwordTarget.vaultFileTaskId as Id<"documentVaultFileTasks">,
                  memberUserKey,
                })
                  .then(() => {
                    showOperationalToast({
                      title: "Password removed",
                      variant: "success",
                    });
                    setPasswordForId(null);
                  })
                  .catch((e) => {
                    showOperationalToast({
                      title: "Could not remove password",
                      description:
                        e instanceof Error ? e.message : "Try again.",
                      variant: "destructive",
                    });
                  })
                  .finally(() => setPasswordBusy(false));
              }}
            >
              Remove password
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setPasswordForId(null);
              setPasswordValue("");
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="min-h-10"
            disabled={passwordBusy || !passwordValue.trim()}
            data-testid="pfs-password-save"
            onClick={() => {
              if (!passwordTarget || !memberUserKey) return;
              setPasswordBusy(true);
              void (async () => {
                try {
                  let fileTaskId = passwordTarget.vaultFileTaskId;
                  if (!fileTaskId) {
                    const ensured = await ensureVaultTask({
                      pipelineFileId: fileId,
                      pfsInstanceId: passwordTarget.id,
                      memberUserKey,
                      assignedContactId: passwordTarget.assignedContactIds?.[0]
                        ? (passwordTarget.assignedContactIds[0] as Id<"contacts">)
                        : undefined,
                      title: pfsAssociatedFormTitle(passwordTarget),
                    });
                    fileTaskId = String(ensured.fileTaskId);
                    onVaultTaskReady?.(passwordTarget.id, fileTaskId);
                  }
                  await setTaskPassword({
                    fileTaskId: fileTaskId as Id<"documentVaultFileTasks">,
                    password: passwordValue,
                    memberUserKey,
                  });
                  showOperationalToast({
                    title: "Password saved",
                    description:
                      "Share the same portal link; only this password opens this PFS.",
                    variant: "success",
                  });
                  setPasswordForId(null);
                  setPasswordValue("");
                } catch (e) {
                  showOperationalToast({
                    title: "Could not set password",
                    description:
                      e instanceof Error ? e.message : "Try again.",
                    variant: "destructive",
                  });
                } finally {
                  setPasswordBusy(false);
                }
              })();
            }}
          >
            {passwordBusy ? "Saving…" : "Save password"}
          </Button>
        </div>
      </OverlayShell>
    </div>
  );
}
