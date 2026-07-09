"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { CollaboratorSharePresentation } from "@/components/ui/CollaboratorSharePresentation";
import { useOrgMemberDisplayLabel } from "@/lib/useOrgMemberDisplayLabel";
import { useResourceAccess } from "@/components/ResourceAccessProvider";

type Props = {
  taskId: Id<"tasks">;
  organizationId: Id<"organizations">;
  ownerUserId?: string;
  memberUserKey: string;
  accessReadOnly?: boolean;
};

export function TaskSharingSection({
  taskId,
  organizationId,
  ownerUserId,
  memberUserKey,
  accessReadOnly = false,
}: Props) {
  const { members, labelFor } = useOrgMemberDisplayLabel(
    organizationId,
    memberUserKey,
  );
  const shares = useQuery(api.taskShares.listForTask, {
    taskId,
    memberUserKey,
  });
  const upsertShare = useMutation(api.taskShares.upsertShare);
  const removeShare = useMutation(api.taskShares.removeShare);

  const trimmedOwner = ownerUserId?.trim() ?? "";
  const me = memberUserKey.trim();
  const { readOnly: ctxReadOnly } = useResourceAccess();

  const canManage = useMemo(() => {
    if (accessReadOnly || ctxReadOnly || !trimmedOwner) return false;
    return trimmedOwner === me;
  }, [accessReadOnly, ctxReadOnly, trimmedOwner, me]);

  const memberLabel = useCallback(
    (userKey: string, serverLabel?: string) =>
      serverLabel?.trim() || labelFor(userKey, { youKey: me }),
    [labelFor, me],
  );

  const picklistUsers = useMemo(() => {
    if (!members) return [];
    return members.filter(
      (m) => m.userKey !== me && m.userKey !== trimmedOwner,
    );
  }, [members, me, trimmedOwner]);

  const [targetKey, setTargetKey] = useState("");
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onAdd = async () => {
    setErr(null);
    const t = targetKey.trim();
    if (!t) {
      setErr("Choose a team member.");
      return;
    }
    setBusy(true);
    try {
      await upsertShare({
        taskId,
        targetLoginOrUserKey: t,
        permission,
        memberUserKey,
      });
      setTargetKey("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (targetLoginOrUserKey: string) => {
    setErr(null);
    setBusy(true);
    try {
      await removeShare({
        taskId,
        targetLoginOrUserKey,
        memberUserKey,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (shares === undefined) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Loading task sharing…
      </div>
    );
  }

  return (
    <CollaboratorSharePresentation
      title="Task access"
      ownerLine={
        trimmedOwner
          ? `Owner: ${labelFor(trimmedOwner, { youKey: me })}`
          : undefined
      }
      canManage={canManage}
      error={err}
      className="sm:col-span-2"
      data-testid="task-sharing-panel"
    >
      <p className="text-xs text-muted-foreground">
        Owner-only sharing via ACL. Collaborators see this task only when shared.
      </p>

      {shares.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {shares.map((s) => (
            <li
              key={s._id}
              className="flex items-center justify-between gap-2 rounded border border-border/50 bg-background px-2 py-1"
            >
              <span className="min-w-0 truncate">
                {memberLabel(s.sharedUserId, s.sharedDisplayUsername)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {s.permission}
              </span>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs"
                  disabled={busy}
                  onClick={() => void onRemove(s.sharedUserId)}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No collaborators yet.</p>
      )}

      {canManage ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-border/50 pt-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="text-xs font-medium text-muted-foreground">
              Share with
            </label>
            <select
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value)}
              disabled={busy || !picklistUsers.length}
            >
              <option value="">Select member…</option>
              {picklistUsers.map((m) => (
                <option key={m.userKey} value={m.userKey}>
                  {memberLabel(
                    m.userKey,
                    m.canonicalDisplayUsername ?? m.displayUsername,
                  )}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:w-28">
            <label className="text-xs font-medium text-muted-foreground">
              Permission
            </label>
            <select
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={permission}
              onChange={(e) =>
                setPermission(e.target.value as "view" | "edit")
              }
              disabled={busy}
            >
              <option value="view">View</option>
              <option value="edit">Edit</option>
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0"
            disabled={busy || !picklistUsers.length}
            onClick={() => void onAdd()}
          >
            Add
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Only the task owner can change sharing.
        </p>
      )}
    </CollaboratorSharePresentation>
  );
}
