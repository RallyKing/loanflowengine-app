"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SearchField } from "@/components/ui/SearchField";
import { CollaboratorSharePresentation } from "@/components/ui/CollaboratorSharePresentation";
import { useOrgMemberDisplayLabel } from "@/lib/useOrgMemberDisplayLabel";
import { normalizeAuthEmail } from "@/lib/auth/normalizeAuthEmail";
import { useResourceAccess } from "@/components/ResourceAccessProvider";

type Props = {
  fileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  /** View-only share — hide owner share controls. */
  accessReadOnly?: boolean;
};

export function PipelineFileSharingSection({
  fileId,
  organizationId,
  memberUserKey,
  accessReadOnly = false,
}: Props) {
  const { members, labelFor } = useOrgMemberDisplayLabel(
    organizationId,
    memberUserKey,
  );
  const access = useQuery(api.pipelineFileShares.listForFile, {
    fileId,
    memberUserKey,
  });
  const shareFile = useMutation(api.pipelineFileShares.shareFile);
  const updateSharePermission = useMutation(
    api.pipelineFileShares.updateSharePermission,
  );
  const revokeShare = useMutation(api.pipelineFileShares.revokeShare);

  const me = memberUserKey.trim();
  const { readOnly: ctxReadOnly } = useResourceAccess();
  const ownerUserId = access?.ownerUserId?.trim() ?? "";
  const canManage =
    !accessReadOnly &&
    !ctxReadOnly &&
    ownerUserId.length > 0 &&
    ownerUserId === me;

  const memberLabel = useCallback(
    (userKey: string, serverLabel?: string) =>
      serverLabel?.trim() || labelFor(userKey, { youKey: me }),
    [labelFor, me],
  );

  const picklistUsers = useMemo(() => {
    if (!members) return [];
    return members.filter(
      (m) => m.userKey !== me && m.userKey !== ownerUserId,
    );
  }, [members, me, ownerUserId]);

  const [memberQuery, setMemberQuery] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [addPermission, setAddPermission] = useState<"view" | "edit">("view");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return picklistUsers;
    return picklistUsers.filter((m) => {
      const label = memberLabel(
        m.userKey,
        m.canonicalDisplayUsername ?? m.displayUsername,
      ).toLowerCase();
      return label.includes(q) || m.userKey.toLowerCase().includes(q);
    });
  }, [picklistUsers, memberQuery, memberLabel]);

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setErr(null);
    setBusyKey(key);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  const onAdd = () =>
    runAction("add", async () => {
      const email = normalizeAuthEmail(targetEmail) ?? "";
      const t = targetKey.trim();
      if (!email && !t) {
        setErr("Choose a team member or enter an email.");
        return;
      }
      await shareFile({
        fileId,
        targetUserKey: t || undefined,
        targetLoginOrEmail: email || undefined,
        permission: addPermission,
        memberUserKey,
      });
      setTargetKey("");
      setTargetEmail("");
      setMemberQuery("");
    });

  const onPermissionChange = (sharedUserId: string, permission: "view" | "edit") =>
    runAction(`perm:${sharedUserId}`, async () => {
      await updateSharePermission({
        fileId,
        sharedUserId,
        permission,
        memberUserKey,
      });
    });

  const onRevokeActive = (sharedUserId: string) =>
    runAction(`revoke:${sharedUserId}`, async () => {
      await revokeShare({ fileId, sharedUserId, memberUserKey });
    });

  const onRevokePending = (inviteId: Id<"pipelineSharePendingInvites">) =>
    runAction(`pending:${inviteId}`, async () => {
      await revokeShare({ fileId, inviteId, memberUserKey });
    });

  if (access === undefined) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Loading file access…
      </div>
    );
  }

  if (!ownerUserId) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
        This file has no canonical owner. Sharing is disabled until ownership is
        assigned.
      </div>
    );
  }

  return (
    <CollaboratorSharePresentation
      title="Pipeline file access"
      ownerLine={`Owner: ${access.ownerDisplayUsername || labelFor(ownerUserId, { youKey: me })}`}
      canManage={canManage}
      error={err}
    >
      {access.shares.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {access.shares.map((s) => (
            <li
              key={s.shareId}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/50 bg-background px-2 py-1.5"
            >
              <span className="min-w-0 truncate font-medium">
                {memberLabel(s.sharedUserId, s.sharedDisplayUsername)}
              </span>
              {canManage ? (
                <div className="flex shrink-0 items-center gap-1">
                  <select
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                    value={s.permission}
                    disabled={busyKey !== null}
                    onChange={(e) =>
                      void onPermissionChange(
                        s.sharedUserId,
                        e.target.value as "view" | "edit",
                      )
                    }
                    aria-label={`Permission for ${s.sharedUserId}`}
                  >
                    <option value="view">View</option>
                    <option value="edit">Edit</option>
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={busyKey !== null}
                    onClick={() => void onRevokeActive(s.sharedUserId)}
                  >
                    Revoke
                  </Button>
                </div>
              ) : (
                <span className="shrink-0 text-xs capitalize text-muted-foreground">
                  {s.permission}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          No collaborators yet.
        </p>
      )}

      {canManage && access.pendingInvites.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-border/50 pt-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">
            Pending invites
          </p>
          {access.pendingInvites.map((inv) => (
            <li
              key={inv.inviteId}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-dashed border-border/60 bg-muted/30 px-2 py-1.5"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {inv.inviteEmail}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-xs capitalize text-muted-foreground">
                  {inv.permission}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={busyKey !== null}
                  onClick={() => void onRevokePending(inv.inviteId)}
                >
                  Revoke
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {canManage ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-border/50 pt-3">
          <div className="min-w-0 flex-1">
            <label className="text-xs font-medium text-muted-foreground">
              Search team members
            </label>
            <SearchField
              compact
              containerClassName="mt-1"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="Filter by name…"
              disabled={busyKey !== null}
            />
            <select
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={targetKey}
              onChange={(e) => {
                setTargetKey(e.target.value);
                if (e.target.value) setTargetEmail("");
              }}
              disabled={busyKey !== null}
            >
              <option value="">Select member…</option>
              {filteredMembers.map((m) => (
                <option key={m.userKey} value={m.userKey}>
                  {memberLabel(
                    m.userKey,
                    m.canonicalDisplayUsername ?? m.displayUsername,
                  )}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label className="text-xs font-medium text-muted-foreground">
              Or email (invite if no account)
            </label>
            <Input
              type="email"
              className="mt-1 h-9"
              value={targetEmail}
              onChange={(e) => {
                setTargetEmail(e.target.value);
                if (e.target.value.trim()) setTargetKey("");
              }}
              placeholder="name@company.com"
              disabled={busyKey !== null}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="sm:w-28">
              <label className="text-xs font-medium text-muted-foreground">
                Permission
              </label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={addPermission}
                onChange={(e) =>
                  setAddPermission(e.target.value as "view" | "edit")
                }
                disabled={busyKey !== null}
              >
                <option value="view">View</option>
                <option value="edit">Edit</option>
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0"
              disabled={
                busyKey !== null || (!targetKey.trim() && !targetEmail.trim())
              }
              onClick={() => void onAdd()}
            >
              Share
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Only the file owner can change sharing.
        </p>
      )}
    </CollaboratorSharePresentation>
  );
}
