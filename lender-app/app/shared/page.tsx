"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { SharedResourceRow } from "@/components/shared/SharedResourceRow";
import { OperationalOrientationStrip } from "@/components/ui/OperationalOrientationStrip";
import { OperationalEmptyState } from "@/components/ui/OperationalEmptyState";
import { OP_ACTIVE_REGION_RING } from "@/lib/ui/operationalElegance";
import { OP_MICRO_CONTROL_CLASS } from "@/lib/ui/operationalInputs";
import { Button } from "@/components/ui/Button";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOrgMemberDisplayLabel } from "@/lib/useOrgMemberDisplayLabel";
import {
  applySharedWorkspaceFilters,
  DEFAULT_SHARED_FILTERS,
  loadSharedWorkspaceFilters,
  saveSharedWorkspaceFilters,
  type SharedWorkspaceFilterSnapshot,
} from "@/lib/sharedWorkspacePersistence";
import { cn } from "@/lib/cn";
import { Share2, Filter } from "lucide-react";
import {
  useConvexSubMountTrace,
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";

type FeedMode = "with_me" | "by_me";

function tabFromParam(raw: string | null): FeedMode {
  return raw === "by_me" ? "by_me" : "with_me";
}

function SharedWorkspaceInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const orgScope = useOrgConvexQueryArgs();
  const mode = tabFromParam(searchParams.get("tab"));

  useConvexSubMountTrace("SharedWorkspace");

  const feedArgs = useMemo(() => {
    if (!orgScope) return null;
    return {
      organizationId: orgScope.organizationId,
      memberUserKey: orgScope.memberUserKey,
      mode,
    };
  }, [orgScope, mode]);

  useConvexSubQueryArgsTrace("SharedWorkspace", feedArgs, {
    queryKey: "sharedWorkspace.listFeed",
    route: "shared",
  });

  const feed = useQuery(api.sharedWorkspace.listFeed, feedArgs ?? "skip");

  const { members, labelFor } = useOrgMemberDisplayLabel(
    orgScope?.organizationId,
    orgScope?.memberUserKey,
  );

  const upsertTaskShare = useMutation(api.taskShares.upsertShare);
  const removeTaskShare = useMutation(api.taskShares.removeShare);
  const shareFile = useMutation(api.pipelineFileShares.shareFile);
  const updateFileSharePermission = useMutation(
    api.pipelineFileShares.updateSharePermission,
  );
  const revokeFileShare = useMutation(api.pipelineFileShares.revokeShare);

  const [filters, setFilters] = useState<SharedWorkspaceFilterSnapshot>(
    DEFAULT_SHARED_FILTERS,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadSharedWorkspaceFilters();
    if (loaded) setFilters(loaded);
  }, []);

  useEffect(() => {
    saveSharedWorkspaceFilters(filters);
  }, [filters]);

  const setTab = useCallback(
    (next: FeedMode) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "with_me") params.delete("tab");
      else params.set("tab", "by_me");
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const memberOptions = useMemo(() => {
    if (!members) return [];
    return members.map((m) => ({
      userKey: m.userKey,
      label:
        m.canonicalDisplayUsername ??
        m.displayUsername ??
        labelFor(m.userKey),
    }));
  }, [members, labelFor]);

  const visibleRows = useMemo(() => {
    if (!feed) return [];
    return applySharedWorkspaceFilters(feed, filters);
  }, [feed, filters]);

  const runShareAction = async (
    rowKey: string,
    action: () => Promise<void>,
  ) => {
    setErr(null);
    setBusyKey(rowKey);
    try {
      await action();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  const handleUpgrade = async (row: (typeof visibleRows)[number]) => {
    await runShareAction(`${row.resourceId}:upgrade`, async () => {
      if (!orgScope) return;
      if (row.resourceType === "task") {
        await upsertTaskShare({
          taskId: row.resourceId as Id<"tasks">,
          targetLoginOrUserKey: row.sharedUserId,
          permission: "edit",
          memberUserKey: orgScope.memberUserKey,
        });
      } else {
        await updateFileSharePermission({
          fileId: row.resourceId as Id<"pipeline">,
          sharedUserId: row.sharedUserId,
          permission: "edit",
          memberUserKey: orgScope.memberUserKey,
        });
      }
    });
  };

  const handleDowngrade = async (row: (typeof visibleRows)[number]) => {
    await runShareAction(`${row.resourceId}:downgrade`, async () => {
      if (!orgScope) return;
      if (row.resourceType === "task") {
        await upsertTaskShare({
          taskId: row.resourceId as Id<"tasks">,
          targetLoginOrUserKey: row.sharedUserId,
          permission: "view",
          memberUserKey: orgScope.memberUserKey,
        });
      } else {
        await updateFileSharePermission({
          fileId: row.resourceId as Id<"pipeline">,
          sharedUserId: row.sharedUserId,
          permission: "view",
          memberUserKey: orgScope.memberUserKey,
        });
      }
    });
  };

  const handleRevoke = async (row: (typeof visibleRows)[number]) => {
    await runShareAction(`${row.resourceId}:revoke`, async () => {
      if (!orgScope) return;
      if (row.resourceType === "task") {
        await removeTaskShare({
          taskId: row.resourceId as Id<"tasks">,
          targetLoginOrUserKey: row.sharedUserId,
          memberUserKey: orgScope.memberUserKey,
        });
      } else {
        await revokeFileShare({
          fileId: row.resourceId as Id<"pipeline">,
          sharedUserId: row.sharedUserId,
          memberUserKey: orgScope.memberUserKey,
        });
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-24 md:pb-8">
      <header className="mb-6 space-y-2">
        <div className="flex items-center gap-2">
          <Share2 className="h-6 w-6 text-primary" aria-hidden />
          <h1 className="text-dlc-title-lg font-semibold tracking-tight text-foreground">
            Shared
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Tasks and pipeline files shared across your organization — live ACL
          feed from resource shares.
        </p>
      </header>

      <OperationalOrientationStrip
        suppressScopeWhenMode
        modeLabel={mode === "with_me" ? "Shared with me" : "Shared by me"}
        data-testid="shared-orientation"
      />

      <div
        role="tablist"
        aria-label="Shared workspace views"
        className="mb-4 flex gap-px rounded-dlc-md border border-border/35 bg-muted/15 p-0.5"
      >
        {(
          [
            ["with_me", "Shared With Me"],
            ["by_me", "Shared By Me"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={cn(
              "flex-1 rounded-dlc-sm px-3 py-2 text-sm font-medium transition-colors duration-dlc-standard ease-dlc-standard",
              mode === id
                ? cn("bg-background font-semibold text-foreground", OP_ACTIVE_REGION_RING)
                : "text-muted-foreground/80 hover:text-foreground",
            )}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden />
          Filters
        </Button>
        {filters.resourceType !== "all" ||
        filters.ownerUserId ||
        filters.recipientUserId ||
        filters.permission !== "all" ||
        filters.recentlyUpdatedOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => setFilters(DEFAULT_SHARED_FILTERS)}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {filtersOpen ? (
        <div className="dlc-surface-card mb-4 grid grid-cols-1 gap-3 rounded-dlc-md border border-border/70 p-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Resource type</span>
            <select
              className="h-9 w-full rounded-dlc-sm border border-border bg-background px-2 text-sm"
              value={filters.resourceType}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  resourceType: e.target.value as typeof f.resourceType,
                }))
              }
            >
              <option value="all">All</option>
              <option value="task">Tasks</option>
              <option value="pipeline">Pipeline files</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Permission</span>
            <select
              className="h-9 w-full rounded-dlc-sm border border-border bg-background px-2 text-sm"
              value={filters.permission}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  permission: e.target.value as typeof f.permission,
                }))
              }
            >
              <option value="all">All</option>
              <option value="view">View</option>
              <option value="edit">Edit</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Owner</span>
            <select
              className="h-9 w-full rounded-dlc-sm border border-border bg-background px-2 text-sm"
              value={filters.ownerUserId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, ownerUserId: e.target.value }))
              }
            >
              <option value="">Any owner</option>
              {memberOptions.map((m) => (
                <option key={m.userKey} value={m.userKey}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {mode === "by_me" ? (
            <label className="space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">Recipient</span>
              <select
                className="h-9 w-full rounded-dlc-sm border border-border bg-background px-2 text-sm"
                value={filters.recipientUserId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, recipientUserId: e.target.value }))
                }
              >
                <option value="">Any recipient</option>
                {memberOptions.map((m) => (
                  <option key={m.userKey} value={m.userKey}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-xs sm:col-span-2">
            <input
              type="checkbox"
              className={OP_MICRO_CONTROL_CLASS}
              checked={filters.recentlyUpdatedOnly}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  recentlyUpdatedOnly: e.target.checked,
                }))
              }
            />
            <span className="text-muted-foreground">
              Recently updated (last 7 days)
            </span>
          </label>
        </div>
      ) : null}

      {err ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      {!orgScope ? (
        <p className="text-sm text-muted-foreground">Select an organization to continue.</p>
      ) : feed === undefined ? (
        <p className="text-sm text-muted-foreground">Loading shared resources…</p>
      ) : visibleRows.length === 0 ? (
        <OperationalEmptyState
          title={
            feed.length === 0
              ? mode === "with_me"
                ? "Nothing shared with you yet"
                : "Nothing shared out yet"
              : "No matches"
          }
          description={
            feed.length === 0
              ? mode === "with_me"
                ? "When teammates share files or tasks with you, they appear here."
                : "Share a pipeline file or task to give teammates access."
              : "Try a different filter or search term."
          }
          data-testid="shared-empty"
        />
      ) : (
        <ul className="space-y-3">
          {visibleRows.map((row) => {
            const rowKey = `${row.resourceType}:${row.resourceId}:${row.sharedUserId}`;
            const busy = busyKey != null && busyKey.startsWith(row.resourceId);
            return (
              <SharedResourceRow
                key={rowKey}
                row={row}
                mode={mode}
                viewerUserKey={orgScope.memberUserKey}
                showRecipient={mode === "by_me"}
                busy={busy}
                onUpgrade={
                  mode === "by_me" ? () => void handleUpgrade(row) : undefined
                }
                onDowngrade={
                  mode === "by_me" ? () => void handleDowngrade(row) : undefined
                }
                onRevoke={
                  mode === "by_me" ? () => void handleRevoke(row) : undefined
                }
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function SharedWorkspacePage() {
  const [recover, setRecover] = useState(0);
  return (
    <ConvexQueryBoundary
      recoverOnKeys={[recover]}
      fallback={
        <div className="p-6">
          <p className="font-medium text-destructive">Could not load shared workspace</p>
          <Button
            type="button"
            className="mt-4"
            variant="outline"
            onClick={() => setRecover((n) => n + 1)}
          >
            Retry
          </Button>
        </div>
      }
    >
      <SharedWorkspaceInner key={recover} />
    </ConvexQueryBoundary>
  );
}
