"use client";

import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useViewer } from "@/lib/sessionContext";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "disabled";

const STATUS_LABEL: Record<Exclude<StatusFilter, "all">, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  disabled: "Disabled",
};

/**
 * Platform-wide account directory for the primary platform administrator.
 * Approves / rejects self-serve signups and can disable accounts.
 * Scrolls with Settings `<main>` — no nested scrollport.
 */
export function PlatformUsersAdminPanel() {
  const viewer = useViewer();
  const memberUserKey = viewer?.userKey;
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = useQuery(
    api.auth.signupAccessAdmin.callerCanManagePlatformUsers,
    memberUserKey ? { memberUserKey } : "skip",
  );

  const pendingCount = useQuery(
    api.auth.signupAccessAdmin.countPendingSignups,
    memberUserKey && canManage?.ok ? { memberUserKey } : "skip",
  );

  const listArgs = useMemo(() => {
    if (!memberUserKey) return "skip" as const;
    if (filter === "all") return { memberUserKey };
    return {
      memberUserKey,
      accessStatus: filter as Exclude<StatusFilter, "all">,
    };
  }, [memberUserKey, filter]);

  const { results, status, loadMore } = usePaginatedQuery(
    api.auth.signupAccessAdmin.listPlatformUsers,
    listArgs === "skip" ? "skip" : listArgs,
    { initialNumItems: 40 },
  );

  const approve = useMutation(api.auth.signupAccessAdmin.approveSignup);
  const reject = useMutation(api.auth.signupAccessAdmin.rejectSignup);
  const disable = useMutation(api.auth.signupAccessAdmin.disableAccount);
  const reenable = useMutation(api.auth.signupAccessAdmin.reenableAccount);

  if (!memberUserKey) return null;
  if (canManage === undefined) {
    return (
      <p className="text-sm text-muted-foreground">Checking access…</p>
    );
  }
  if (!canManage.ok) {
    return (
      <p className="text-sm text-muted-foreground">
        Platform user administration is not available for this account.
      </p>
    );
  }

  async function runAction(
    userId: Id<"authUsers">,
    action: "approve" | "reject" | "disable" | "reenable",
  ) {
    setError(null);
    setBusyId(userId);
    try {
      const args = { memberUserKey: memberUserKey!, targetUserId: userId };
      if (action === "approve") await approve(args);
      else if (action === "reject") await reject(args);
      else if (action === "disable") await disable(args);
      else await reenable(args);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Review self-serve signups and manage access across every workspace.
          {pendingCount !== undefined ? (
            <span className="ml-1 font-medium text-foreground">
              {pendingCount.count} pending
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-1">
          {(
            ["pending", "all", "approved", "rejected", "disabled"] as const
          ).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard",
                filter === key
                  ? "bg-brand text-brand-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "all" ? "All" : STATUS_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}

      {results.length === 0 && status !== "LoadingFirstPage" ? (
        <p className="text-sm text-muted-foreground">No accounts in this view.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {results.map((row) => {
            const busy = busyId === row.userId;
            return (
              <li
                key={row.userId}
                className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium text-foreground">
                    {row.displayUsername}
                    {row.isPrimaryPlatformAdmin ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (platform owner)
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.email || row.normalizedUsername}
                    {row.organizationName
                      ? ` · ${row.organizationName}`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status:{" "}
                    <span className="font-medium text-foreground">
                      {STATUS_LABEL[row.accessStatus]}
                    </span>
                    {" · "}
                    Joined {new Date(row.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.accessStatus === "pending" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || row.isPrimaryPlatformAdmin}
                        onClick={() => void runAction(row.userId, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || row.isPrimaryPlatformAdmin}
                        onClick={() => void runAction(row.userId, "reject")}
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {row.accessStatus === "approved" &&
                  !row.isPrimaryPlatformAdmin ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void runAction(row.userId, "disable")}
                    >
                      Disable
                    </Button>
                  ) : null}
                  {(row.accessStatus === "disabled" ||
                    row.accessStatus === "rejected") &&
                  !row.isPrimaryPlatformAdmin ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void runAction(row.userId, "reenable")}
                    >
                      Re-enable
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {status === "CanLoadMore" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => loadMore(40)}
        >
          Load more
        </Button>
      ) : null}
      {status === "LoadingMore" || status === "LoadingFirstPage" ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : null}
    </div>
  );
}
