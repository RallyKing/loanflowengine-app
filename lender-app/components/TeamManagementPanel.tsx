"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { UserCog } from "lucide-react";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";

export function TeamManagementPanel() {
  const { confirm } = useOperationalConfirm();
  const { activeOrganizationId, can } = useOrgPermissions();
  const memberUserKey = useActorUserKey();
  const orgId = activeOrganizationId;

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
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roleOptions = useMemo(() => {
    if (!roles) return [];
    return [...roles].sort((a, b) => a.label.localeCompare(b.label));
  }, [roles]);

  const onCreateUser = useCallback(async () => {
    if (!orgId || !memberUserKey || !newRoleId) return;
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
      setMsg("User created and added to this workspace.");
      setNewUsername("");
      setNewPassword("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [orgId, memberUserKey, newUsername, newPassword, newRoleId]);

  const onResetPassword = useCallback(async () => {
    if (!orgId || !resetTarget.trim() || !resetPassword) return;
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
      setMsg("Password updated; all sessions for that user were invalidated.");
      setResetPassword("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [orgId, resetTarget, resetPassword]);

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

  return (
    <div
      className="space-y-6"
      data-testid="team-management-panel"
    >
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
          className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground"
          role="status"
        >
          {msg}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
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
            Initial password
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
              className="mt-1 h-9 w-full"
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
            size="sm"
            disabled={busy || !newUsername.trim() || !newPassword || !newRoleId}
            onClick={() => void onCreateUser()}
          >
            Create and add to workspace
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
          <p className="text-sm font-medium text-foreground">Reset password</p>
          <label className="block text-xs text-muted-foreground">
            Target user key (Convex auth id)
            <Input
              className="mt-1 font-mono text-xs"
              value={resetTarget}
              onChange={(e) => setResetTarget(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            New password
            <Input
              type="password"
              className="mt-1"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !resetTarget.trim() || !resetPassword}
            onClick={() => void onResetPassword()}
          >
            Reset password &amp; invalidate sessions
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60">
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
                  className="border-b border-border/40 last:border-b-0"
                >
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-foreground">
                      {row.canonicalDisplayUsername ??
                        row.displayUsername ??
                        "—"}
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
                        className="h-8 w-full max-w-[220px] text-xs"
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
                              setMsg("Role updated; user sessions refreshed.");
                            } catch (err) {
                              setMsg(
                                err instanceof Error ? err.message : String(err),
                              );
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
                            className="h-8 px-2"
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
                                  setMsg("Membership updated.");
                                } catch (e) {
                                  setMsg(
                                    e instanceof Error ? e.message : String(e),
                                  );
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
                            className="h-8 px-2"
                            disabled={busy}
                            onClick={() => {
                              void (async () => {
                                try {
                                  await forceLogout({
                                    organizationId: orgId,
                                    targetUserKey: row.userKey,
                                    actorUserKey: memberUserKey,
                                  });
                                  setMsg("Sessions revoked.");
                                } catch (e) {
                                  setMsg(
                                    e instanceof Error ? e.message : String(e),
                                  );
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
                            className="h-8 px-2 text-destructive"
                            disabled={busy}
                            onClick={() => {
                              void (async () => {
                                const ok = await confirm({
                                  variant: "remove_collaborator",
                                  title: "Remove collaborator",
                                  entityName:
                                    row.canonicalDisplayUsername?.trim() ||
                                    row.displayUsername?.trim() ||
                                    row.userKey,
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
                                  setMsg("Member removed.");
                                } catch (e) {
                                  setMsg(
                                    e instanceof Error ? e.message : String(e),
                                  );
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
