"use client";

import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ChevronDown, ChevronRight, KeyRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useViewer } from "@/lib/sessionContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  MIN_PLAINTEXT_PASSWORD_LENGTH,
  plaintextPasswordRequirementSummary,
  validatePlaintextPasswordPolicy,
} from "@/lib/auth/passwordPolicy";

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "disabled";

const STATUS_LABEL: Record<Exclude<StatusFilter, "all">, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  disabled: "Disabled",
};

const EVENT_LABEL: Record<string, string> = {
  signup: "Signup",
  signup_approved: "Approved",
  signup_rejected: "Rejected",
  account_disabled: "Disabled",
  account_reenabled: "Re-enabled",
  login_success: "Login",
  login_failure: "Login failed",
  password_reset_by_owner: "Password reset (owner)",
  password_reset_by_org_admin: "Password reset (org)",
  force_logout: "Force logout",
  document_download: "Download",
  lender_import: "Lender import",
  pipeline_file_created: "New pipeline file",
  data_export: "Export",
};

type PlatformUserRow = {
  userId: Id<"authUsers">;
  userKey: string;
  displayUsername: string;
  normalizedUsername: string;
  email: string | null;
  accessStatus: Exclude<StatusFilter, "all">;
  organizationName: string | null;
  createdAt: number;
  isPrimaryPlatformAdmin: boolean;
};

function AccountActivityLog({
  subjectUserId,
  memberUserKey,
}: {
  subjectUserId: Id<"authUsers">;
  memberUserKey: string;
}) {
  const listArgs = useMemo(
    () => ({ memberUserKey, subjectUserId }),
    [memberUserKey, subjectUserId],
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.auth.platformAccountAudit.listAccountActivityLog,
    listArgs,
    { initialNumItems: 20 },
  );

  if (status === "LoadingFirstPage") {
    return (
      <p className="text-xs text-muted-foreground">Loading activity…</p>
    );
  }

  if (results.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No activity recorded yet for this account.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5 border-l border-border pl-3">
        {results.map((ev) => (
          <li key={ev.id} className="text-xs">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium text-foreground">
                {EVENT_LABEL[ev.eventType] ?? ev.eventType}
              </span>
              <time
                className="text-muted-foreground"
                dateTime={new Date(ev.at).toISOString()}
              >
                {new Date(ev.at).toLocaleString()}
              </time>
            </div>
            <p className="text-muted-foreground">{ev.summary}</p>
            {ev.detail ? (
              <p className="text-muted-foreground/80">{ev.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 min-h-9"
          onClick={() => loadMore(20)}
        >
          Load more activity
        </Button>
      ) : null}
      {status === "LoadingMore" ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : null}
    </div>
  );
}

function PasswordResetForm({
  targetUserId,
  displayLabel,
  disabled,
  onDone,
  onError,
}: {
  targetUserId: Id<"authUsers">;
  displayLabel: string;
  disabled?: boolean;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const hint = plaintextPasswordRequirementSummary();

  async function submit() {
    const pwErr = validatePlaintextPasswordPolicy(password);
    if (pwErr) {
      onError(pwErr);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/platform/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Password reset failed.");
      }
      setPassword("");
      onDone(
        `Password updated for ${displayLabel}; all of their sessions were signed out.`,
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Password reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-dlc-md border border-border/60 bg-dlc-surface-low/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
        Set / reset password
      </div>
      <p className="text-xs text-muted-foreground">
        Owner override (GHL-style). New password is hashed server-side and never
        written to the activity log. All sessions for this account are revoked.
      </p>
      <label className="block text-xs text-muted-foreground">
        New password ({hint})
        <Input
          type="password"
          autoComplete="new-password"
          className="mt-1 h-10 min-h-10"
          value={password}
          disabled={disabled || busy}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <Button
        type="button"
        size="sm"
        className="h-10 min-h-10"
        disabled={
          disabled ||
          busy ||
          password.length < MIN_PLAINTEXT_PASSWORD_LENGTH
        }
        onClick={() => void submit()}
      >
        {busy ? "Saving…" : "Reset password & sign out sessions"}
      </Button>
    </div>
  );
}

/**
 * Platform-wide account directory for the primary platform administrator.
 * Approves / rejects self-serve signups, disables accounts, resets passwords,
 * and expands a per-account activity log book.
 * Scrolls with Settings `<main>` — no nested scrollport.
 */
export function PlatformUsersAdminPanel() {
  const viewer = useViewer();
  const memberUserKey = viewer?.userKey;
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<Id<"authUsers"> | null>(null);

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
    setOkMsg(null);
    setBusyId(userId);
    try {
      const args = { memberUserKey: memberUserKey!, targetUserId: userId };
      if (action === "approve") await approve(args);
      else if (action === "reject") await reject(args);
      else if (action === "disable") await disable(args);
      else await reenable(args);
      setOkMsg(
        action === "approve"
          ? "Account approved."
          : action === "reject"
            ? "Account rejected; sessions revoked."
            : action === "disable"
              ? "Account disabled; sessions revoked."
              : "Account re-enabled.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="platform-users-admin-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          GHL-style account management: review signups, reset passwords, disable
          access, and expand each row for the activity log book.
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
                "min-h-10 rounded-dlc-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard",
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
          className="rounded-dlc-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}
      {okMsg ? (
        <div
          role="status"
          className="rounded-dlc-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-foreground"
        >
          {okMsg}
        </div>
      ) : null}

      {viewer?.canSuperuserImpersonate ? (
        <p className="text-xs text-muted-foreground">
          Workspace impersonation (login as tenant) stays under{" "}
          <a href="/settings#systemAdmin" className="underline underline-offset-2">
            System admin
          </a>
          — owner-gated and unchanged.
        </p>
      ) : null}

      {results.length === 0 && status !== "LoadingFirstPage" ? (
        <p className="text-sm text-muted-foreground">No accounts in this view.</p>
      ) : (
        <ul className="divide-y divide-border rounded-dlc-lg border border-border bg-dlc-surface">
          {(results as PlatformUserRow[]).map((row) => {
            const busy = busyId === row.userId;
            const expanded = expandedId === row.userId;
            return (
              <li key={row.userId} className="px-3 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2 rounded-dlc-md text-left transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedId(expanded ? null : row.userId)
                    }
                  >
                    <span className="mt-0.5 text-muted-foreground" aria-hidden>
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
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
                  </button>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {row.accessStatus === "pending" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          className="h-10 min-h-10"
                          disabled={busy || row.isPrimaryPlatformAdmin}
                          onClick={() => void runAction(row.userId, "approve")}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-10 min-h-10"
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
                        className="h-10 min-h-10"
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
                        className="h-10 min-h-10"
                        disabled={busy}
                        onClick={() => void runAction(row.userId, "reenable")}
                      >
                        Re-enable
                      </Button>
                    ) : null}
                  </div>
                </div>

                {expanded ? (
                  <div className="mt-3 space-y-4 border-t border-border/60 pt-3 sm:pl-6">
                    <PasswordResetForm
                      targetUserId={row.userId}
                      displayLabel={row.displayUsername}
                      disabled={busy}
                      onDone={(msg) => {
                        setError(null);
                        setOkMsg(msg);
                      }}
                      onError={(msg) => {
                        setOkMsg(null);
                        setError(msg);
                      }}
                    />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Activity log book
                      </p>
                      <AccountActivityLog
                        subjectUserId={row.userId}
                        memberUserKey={memberUserKey}
                      />
                    </div>
                  </div>
                ) : null}
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
          className="h-10 min-h-10"
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
