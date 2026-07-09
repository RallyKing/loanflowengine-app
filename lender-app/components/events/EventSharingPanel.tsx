"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { useOrgMemberDisplayLabel } from "@/lib/useOrgMemberDisplayLabel";
import { EventCollaboratorRoleBadge } from "@/components/events/EventCollaboratorRoleBadge";
import { CollaboratorSharePresentation } from "@/components/ui/CollaboratorSharePresentation";
import { cn } from "@/lib/cn";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";

type Role = "co_owner" | "editor" | "viewer";

type Props = {
  eventId: Id<"events">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  ownerUserId: string;
  canManage: boolean;
  canTransferOwnership: boolean;
};

export function EventSharingPanel({
  eventId,
  organizationId,
  memberUserKey,
  ownerUserId,
  canManage,
  canTransferOwnership,
}: Props) {
  const sharing = useQuery(api.events.eventShares.listForEvent, {
    eventId,
    memberUserKey,
  });
  const upsertShare = useMutation(api.events.eventShares.upsertShare);
  const removeShare = useMutation(api.events.eventShares.removeShare);
  const removePending = useMutation(api.events.eventShares.removePendingInvite);
  const transfer = useMutation(api.events.eventShares.transferOwnership);

  const { members, labelFor } = useOrgMemberDisplayLabel(
    organizationId,
    memberUserKey,
  );

  const [target, setTarget] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [transferTarget, setTransferTarget] = useState("");
  const [transferConfirm, setTransferConfirm] = useState(false);
  const { confirm: confirmDestructive } = useOperationalConfirm();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const me = memberUserKey.trim();
  const picklist = useMemo(() => {
    if (!members) return [];
    return members.filter(
      (m) => m.userKey !== me && m.userKey !== ownerUserId.trim(),
    );
  }, [members, me, ownerUserId]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setErr(null);
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (sharing === undefined) {
    return (
      <p className="text-xs text-muted-foreground">Loading collaborators…</p>
    );
  }

  return (
    <CollaboratorSharePresentation
      title="Event access"
      ownerLine={`Owner: ${sharing.ownerDisplayUsername || "—"}`}
      canManage={canManage}
      error={err}
      data-testid="event-sharing-panel"
    >
      <ul className="space-y-2 text-sm">
        {sharing.shares.map((s) => (
          <li
            key={String(s._id)}
            className="flex flex-col gap-2 rounded-md border border-border/60 bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {s.sharedDisplayUsername || s.sharedUserId}
              </p>
              <EventCollaboratorRoleBadge
                role={s.collaboratorRole}
                className="mt-1"
              />
            </div>
            {canManage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-10 shrink-0 self-start sm:self-center"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    removeShare({
                      eventId,
                      targetLoginOrUserKey: s.sharedUserId,
                      memberUserKey,
                    }),
                  )
                }
              >
                Remove
              </Button>
            ) : null}
          </li>
        ))}
        {sharing.pendingInvites.map((p) => (
          <li
            key={String(p._id)}
            className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-muted-foreground">{p.inviteEmail}</p>
              <EventCollaboratorRoleBadge role="pending" className="mt-1" />
            </div>
            {canManage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-10 shrink-0"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    removePending({ inviteId: p._id, memberUserKey }),
                  )
                }
              >
                Cancel invite
              </Button>
            ) : null}
          </li>
        ))}
        {sharing.shares.length === 0 && sharing.pendingInvites.length === 0 ? (
          <li className="text-xs text-muted-foreground">No collaborators yet.</li>
        ) : null}
      </ul>

      {canManage ? (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <p className="text-xs font-medium text-foreground">Invite collaborator</p>
          <div className="flex flex-col gap-2">
            <select
              className="min-h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Select member…</option>
              {picklist.map((m) => (
                <option key={m.userKey} value={m.userKey}>
                  {labelFor(m.userKey, { youKey: me })}
                </option>
              ))}
            </select>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                className="min-h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="viewer">Viewer — read only</option>
                <option value="editor">Editor — edit content</option>
                <option value="co_owner">Co-owner — edit + manage sharing</option>
              </select>
              <Button
                type="button"
                size="sm"
                className="min-h-10 shrink-0"
                disabled={busy || !target.trim()}
                onClick={() =>
                  run(() =>
                    upsertShare({
                      eventId,
                      targetLoginOrUserKey: target.trim(),
                      collaboratorRole: role,
                      memberUserKey,
                    }),
                  ).then(() => setTarget(""))
                }
              >
                Share
              </Button>
            </div>
          </div>
          <input
            type="email"
            placeholder="Or email for pending invite"
            className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const v = (e.target as HTMLInputElement).value.trim();
              if (!v) return;
              run(() =>
                upsertShare({
                  eventId,
                  targetLoginOrUserKey: v,
                  collaboratorRole: role,
                  memberUserKey,
                }),
              ).then(() => {
                (e.target as HTMLInputElement).value = "";
              });
            }}
          />
          <p className="text-xs text-muted-foreground">
            Editors cannot manage collaborators. Co-owners can share and remove
            access but cannot transfer ownership.
          </p>
        </div>
      ) : null}

      {canTransferOwnership ? (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <p className="text-xs font-medium text-foreground">Transfer ownership</p>
          <p className="text-xs text-muted-foreground">
            This permanently gives another member full owner control. You will
            lose owner-only actions unless they share back.
          </p>
          <select
            className="min-h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={transferTarget}
            onChange={(e) => {
              setTransferTarget(e.target.value);
              setTransferConfirm(false);
            }}
          >
            <option value="">New owner…</option>
            {picklist.map((m) => (
              <option key={m.userKey} value={m.userKey}>
                {labelFor(m.userKey, { youKey: me })}
              </option>
            ))}
          </select>
          <label
            className={cn(
              "flex items-start gap-2 text-xs",
              !transferTarget && "opacity-50",
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              disabled={!transferTarget}
              checked={transferConfirm}
              onChange={(e) => setTransferConfirm(e.target.checked)}
            />
            <span>
              I understand ownership will transfer immediately and cannot be
              undone from this screen.
            </span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 w-full text-destructive sm:w-auto"
            disabled={busy || !transferTarget || !transferConfirm}
            onClick={() => {
              void (async () => {
                const label =
                  picklist.find((m) => m.userKey === transferTarget)?.userKey ??
                  transferTarget;
                const ok = await confirmDestructive({
                  variant: "transfer",
                  title: "Transfer ownership",
                  entityName: label,
                  impact: "This cannot be undone here.",
                });
                if (!ok) return;
                run(() =>
                transfer({
                  eventId,
                  newOwnerLoginOrUserKey: transferTarget,
                  memberUserKey,
                }),
              ).then(() => {
                setTransferTarget("");
                setTransferConfirm(false);
              });
              })();
            }}
          >
            Transfer ownership
          </Button>
        </div>
      ) : null}

    </CollaboratorSharePresentation>
  );
}
