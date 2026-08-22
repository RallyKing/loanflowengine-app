"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import {
  MIN_PLAINTEXT_PASSWORD_LENGTH,
  plaintextPasswordRequirementSummary,
  validatePlaintextPasswordPolicy,
} from "@/lib/auth/passwordPolicy";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { UserCog } from "lucide-react";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";

type DirectoryRow = {
  userKey: string;
  tenantRole: "owner" | "admin" | "member";
  productRoleLabel?: string;
  assignedRoleId?: Id<"organizationRoles">;
  isActive: boolean;
  displayUsername?: string;
  canonicalDisplayUsername?: string;
};

function memberLabel(row: DirectoryRow): string {
  return (
    row.canonicalDisplayUsername?.trim() ||
    row.displayUsername?.trim() ||
    row.userKey
  );
}

export function TeamManagementPanel() {
  const { confirm } = useOperationalConfirm();
  const { activeOrganizationId, can } = useOrgPermissions();
  const memberUserKey = useActorUserKey();
  const orgId = activeOrganizationId;
  const resetPasswordInputRef = useRef<HTMLInputElement>(null);

  const canManage = can("org.members.invite") || can("org.roles.manage");

  const directory = useQuery(
    api.teamManagement.listTeamDirectory,
    orgId && canManage && memberUserKey
      ? { organizationId: orgId, memberUserKey }
      : "skip",
  );

  const roles = useQuery(
    api.organizations.listRoles,
    orgId && canManage && memberUserKey
      ? { organizationId: orgId, memberUserKey }
      : "skip",
  );

  const setActive = useMutation(api.teamManagement.setMemberActive);
  const forceLogout = useMutation(api.teamManagement.forceLogoutMemberSessions);
  const removeMember = useMutation(api.organizations.removeMember);
  const setProductRole = useMutation(api.organizations.setMemberProductRole);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRoleId, setNewRoleId] = useState<string>("");
  const [resetTarget, setResetTarget] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const roleOptions = useMemo(() => {
    if (!roles) return [];
    return [...roles].sort((a, b) => a.label.localeCompare(b.label));
  }, [roles]);

  /** Password reset targets: workspace members only (owner excluded, same as deactivate/remove). */
  const resettableMembers = useMemo(() => {
    if (!directory) return [];
    return directory.filter((row) => row.tenantRole !== "owner");
  }, [directory]);

  const selectedResetMember = useMemo(
    () => resettableMembers.find((row) => row.userKey === resetTarget) ?? null,
    [resettableMembers, resetTarget],
  );

  const selectMemberForReset = useCallback((userKey: string) => {
    setResetTarget(userKey);
    setMsg(null);
    window.requestAnimationFrame(() => {
      resetPasswordInputRef.current?.focus();
      resetPasswordInputRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }, []);

  const onCreateUser = useCallback(async () => {
    if (!orgId || !memberUserKey || !newRoleId) return;
    const pwErr = validatePlaintextPasswordPolicy(newPassword);
    if (pwErr) {
      setMsg({ kind: "err", text: pwErr });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/org/team/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          username: newUsername.trim(),
          password: newPassword,
          assignedRoleId: newRoleId,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? res.statusText);
      }
      setMsg({
        kind: "ok",
        text: "User created and added to this workspace.",
      });
      setNewUsername("");
      setNewPassword("");
    } catch (e) {
      setMsg({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }, [orgId, memberUserKey, newUsername, newPassword, newRoleId]);

  const onResetPassword = useCallback(async () => {
    if (!orgId || !resetTarget.trim()) {
      setMsg({ kind: "err", text: "Select a team member first." });
      return;
    }
    if (!resetPassword) {
      setMsg({ kind: "err", text: "Enter a new password." });
      return;
    }
    const pwErr = validatePlaintextPasswordPolicy(resetPassword);
    if (pwErr) {
      setMsg({ kind: "err", text: pwErr });
      return;
    }
    const label = selectedResetMember
      ? memberLabel(selectedResetMember)
      : resetTarget.trim();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/org/team/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          targetUserKey: resetTarget.trim(),
          password: resetPassword,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? res.statusText);
      }
      setMsg({
        kind: "ok",
        text: `Password updated for ${label}; all of their sessions were signed out.`,
      });
      setResetPassword("");
    } catch (e) {
      setMsg({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }, [orgId, resetTarget, resetPassword, selectedResetMember]);

  if (!orgId) {
    return (
      <div data-testid="team-management-panel">
        <p className="text-sm text-muted-foreground">
          Select a workspace to manage team access.
        </p>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div data-testid="team-management-panel">
        <p className="text-sm text-muted-foreground">
          You need member-invite or role-management permissions to use team
          administration.
        </p>
      </div>
    );
  }

  const passwordHint = plaintextPasswordRequirementSummary();
  const canSubmitReset =
    Boolean(resetTarget.trim()) &&
    resetPassword.length >= MIN_PLAINTEXT_PASSWORD_LENGTH;

  return (
    <div className="space-y-6" data-testid="team-management-panel">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <UserCog className="h-4 w-4 shrink-0" aria-hidden />
        Team management
      </div>
      <p className="text-xs text-muted-foreground">
        Create native accounts, assign product roles, deactivate members, reset
        passwords, and force sign-out. Login attempts are written to an
        immutable audit trail (Convex{" "}
        <span className="font-mono text-[11px]">authLoginAudit</span>).
      </p>

      {msg ? (
        <p
          className={
            msg.kind === "ok"
              ? "rounded-dlc-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-foreground"
              : "rounded-dlc-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
          }
          role="status"
        >
          {msg.text}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-dlc-md border border-border/60 bg-dlc-surface-low/40 p-4">
          <p className="text-sm font-medium text-foreground">Create user</p>
          <label className="block text-xs text-muted-foreground">
            Username (case-insensitive)
            <Input
              className="mt-1"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Initial password ({passwordHint})
            <Input
              type="password"
              className="mt-1"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Product role
            <Select
              className="mt-1 h-10 w-full"
              value={newRoleId}
              onChange={(e) => setNewRoleId(e.target.value)}
              disabled={busy || !roleOptions.length}
            >
              <option value="">Select role…</option>
              {roleOptions.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.label} ({r.key})
                </option>
              ))}
            </Select>
          </label>
          <Button
            type="button"
            className="min-h-10"
            disabled={busy || !newUsername.trim() || !newPassword || !newRoleId}
            onClick={() => void onCreateUser()}
          >
            Create and add to workspace
          </Button>
        </div>

        <div
          id="team-reset-password"
          className="space-y-3 rounded-dlc-md border border-border/60 bg-dlc-surface-low/40 p-4"
        >
          <p className="text-sm font-medium text-foreground">Reset password</p>
          <p className="text-xs text-muted-foreground">
            Choose a member (or use Reset password on a row), set a new
            password, then apply. Their active sessions are signed out
            immediately. Workspace owner accounts are not reset from this form.
          </p>
          <label className="block text-xs text-muted-foreground">
            Team member
            <Select
              className="mt-1 h-10 w-full"
              value={resetTarget}
              onChange={(e) => {
                setResetTarget(e.target.value);
                setMsg(null);
              }}
              disabled={busy || resettableMembers.length === 0}
              data-testid="team-reset-member-select"
            >
              <option value="">
                {resettableMembers.length === 0
                  ? "No resettable members"
                  : "Select member…"}
              </option>
              {resettableMembers.map((row) => (
                <option key={row.userKey} value={row.userKey}>
                  {memberLabel(row)}
                  {!row.isActive ? " (deactivated)" : ""}
                  {row.tenantRole === "admin" ? " · Admin" : ""}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-xs text-muted-foreground">
            New password ({passwordHint})
            <Input
              ref={resetPasswordInputRef}
              type="password"
              className="mt-1"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              autoComplete="new-password"
              disabled={busy || !resetTarget}
              data-testid="team-reset-password-input"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            disabled={busy || !canSubmitReset}
            onClick={() => void onResetPassword()}
            data-testid="team-reset-password-submit"
          >
            Reset password &amp; invalidate sessions
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-dlc-md border border-border/60">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border/60 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Tenant</th>
              <th className="px-3 py-2 font-medium">Product role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {directory === undefined ? (
              <tr>
                <td className="px-3 py-4 text-muted-foreground" colSpan={5}>
                  Loading directory…
                </td>
              </tr>
            ) : directory.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-muted-foreground" colSpan={5}>
                  No members found.
                </td>
              </tr>
            ) : (
              directory.map((row) => (
                <tr
                  key={row.userKey}
                  className={
                    resetTarget === row.userKey
                      ? "border-b border-border/40 bg-primary/5 last:border-b-0"
                      : "border-b border-border/40 last:border-b-0"
                  }
                >
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-foreground">
                      {memberLabel(row)}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-xs capitalize">
                    {row.tenantRole}
                  </td>
                  <td className="px-3 py-2 align-top text-xs">
                    {row.tenantRole === "owner" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Select
                        className="h-10 w-full max-w-[220px] text-xs"
                        key={`${row.userKey}-${row.assignedRoleId ?? ""}`}
                        defaultValue={row.assignedRoleId ?? ""}
                        disabled={busy || !roleOptions.length}
                        onChange={(e) => {
                          const v = e.target.value as Id<"organizationRoles">;
                          if (!v) return;
                          void (async () => {
                            try {
                              await setProductRole({
                                organizationId: orgId,
                                userKey: row.userKey,
                                assignedRoleId: v,
                                actorUserKey: memberUserKey,
                              });
                              setMsg({
                                kind: "ok",
                                text: "Role updated; user sessions refreshed.",
                              });
                            } catch (err) {
                              setMsg({
                                kind: "err",
                                text:
                                  err instanceof Error
                                    ? err.message
                                    : String(err),
                              });
                            }
                          })();
                        }}
                      >
                        <option value="">Select…</option>
                        {roleOptions.map((r) => (
                          <option key={r._id} value={r._id}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-xs">
                    {row.isActive ? (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        Active
                      </span>
                    ) : (
                      <span className="text-destructive">Deactivated</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-right text-xs">
                    <div className="flex flex-wrap justify-end gap-1">
                      {row.tenantRole !== "owner" ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-10 px-2.5"
                            disabled={busy}
                            onClick={() => selectMemberForReset(row.userKey)}
                          >
                            Reset password
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-10 px-2.5"
                            disabled={busy}
                            onClick={() => {
                              void (async () => {
                                try {
                                  await setActive({
                                    organizationId: orgId,
                                    targetUserKey: row.userKey,
                                    isActive: !row.isActive,
                                    actorUserKey: memberUserKey,
                                  });
                                  setMsg({
                                    kind: "ok",
                                    text: "Membership updated.",
                                  });
                                } catch (e) {
                                  setMsg({
                                    kind: "err",
                                    text:
                                      e instanceof Error
                                        ? e.message
                                        : String(e),
                                  });
                                }
                              })();
                            }}
                          >
                            {row.isActive ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-10 px-2.5"
                            disabled={busy}
                            onClick={() => {
                              void (async () => {
                                try {
                                  await forceLogout({
                                    organizationId: orgId,
                                    targetUserKey: row.userKey,
                                    actorUserKey: memberUserKey,
                                  });
                                  setMsg({
                                    kind: "ok",
                                    text: "Sessions revoked.",
                                  });
                                } catch (e) {
                                  setMsg({
                                    kind: "err",
                                    text:
                                      e instanceof Error
                                        ? e.message
                                        : String(e),
                                  });
                                }
                              })();
                            }}
                          >
                            Log out
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="min-h-10 px-2.5 text-destructive"
                            disabled={busy}
                            onClick={() => {
                              void (async () => {
                                const ok = await confirm({
                                  variant: "remove_collaborator",
                                  title: "Remove collaborator",
                                  entityName: memberLabel(row),
                                  impact:
                                    "They will lose access to this workspace.",
                                });
                                if (!ok) return;
                                try {
                                  await removeMember({
                                    organizationId: orgId,
                                    userKey: row.userKey,
                                    actorUserKey: memberUserKey,
                                  });
                                  if (resetTarget === row.userKey) {
                                    setResetTarget("");
                                    setResetPassword("");
                                  }
                                  setMsg({
                                    kind: "ok",
                                    text: "Member removed.",
                                  });
                                } catch (e) {
                                  setMsg({
                                    kind: "err",
                                    text:
                                      e instanceof Error
                                        ? e.message
                                        : String(e),
                                  });
                                }
                              })();
                            }}
                          >
                            Remove
                          </Button>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Owner</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
