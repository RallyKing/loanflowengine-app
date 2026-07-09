"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { cn } from "@/lib/cn";
import {
  Activity,
  ChevronRight,
  ExternalLink,
  Filter,
  User,
} from "lucide-react";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import { useDocumentTabVisible } from "@/lib/hooks/useDocumentTabVisible";
import {
  useConvexSubMountTrace,
  useConvexSubQueryArgsTrace,
} from "@/lib/convexSubDiagnosticsHooks";

const CATEGORIES = ["file", "contact", "lender", "task"] as const;
type FeedCategory = (typeof CATEGORIES)[number];

function categoryLabel(c: FeedCategory): string {
  switch (c) {
    case "file":
      return "Files";
    case "contact":
      return "Contacts";
    case "lender":
      return "Lenders";
    case "task":
      return "Tasks";
    default:
      return c;
  }
}

function categoryBadgeClass(c: FeedCategory): string {
  switch (c) {
    case "file":
      return "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100";
    case "contact":
      return "border-violet-500/40 bg-violet-500/10 text-violet-900 dark:text-violet-100";
    case "lender":
      return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100";
    case "task":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
    default:
      return "border-border bg-muted/40";
  }
}

function ActivityPageInner() {
  const { accountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const memberKey = accountId.trim();
  const tabVisible = useDocumentTabVisible();

  const [categoryFilter, setCategoryFilter] = useState<FeedCategory | "all">(
    "all",
  );
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [fileFilter, setFileFilter] = useState<string>("all");
  const [cursorStack, setCursorStack] = useState<Array<number | undefined>>([]);

  const scope = useMemo(() => {
    if (activeOrganizationId && memberKey) {
      return {
        scopeKind: "org" as const,
        scopeId: activeOrganizationId as string,
        memberUserKey: memberKey,
      };
    }
    return {
      scopeKind: "user" as const,
      scopeId: memberKey,
      memberUserKey: memberKey,
    };
  }, [activeOrganizationId, memberKey]);

  const cursorBeforeAt =
    cursorStack.length > 0 ? cursorStack[cursorStack.length - 1] : undefined;

  const listArgs = useMemo(() => {
    if (!tabVisible || !memberKey) return "skip" as const;
    return {
      ...scope,
      limit: 35,
      ...(cursorBeforeAt != null ? { cursorBeforeAt } : {}),
      ...(categoryFilter !== "all" ? { categoryFilter } : {}),
      ...(actorFilter !== "all" ? { actorKeyFilter: actorFilter } : {}),
      ...(fileFilter !== "all"
        ? { fileIdFilter: fileFilter as Id<"pipeline"> }
        : {}),
    };
  }, [
    tabVisible,
    memberKey,
    scope,
    cursorBeforeAt,
    categoryFilter,
    actorFilter,
    fileFilter,
  ]);

  const actorKeysArgs = useMemo(() => {
    if (!tabVisible || !memberKey) return "skip" as const;
    return {
      ...scope,
      scanLimit: 160,
    };
  }, [tabVisible, memberKey, scope]);

  const pipelineLightArgs = useMemo(():
    | { organizationId: Id<"organizations">; memberUserKey: string }
    | "skip" => {
    if (
      !tabVisible ||
      scope.scopeKind !== "org" ||
      !activeOrganizationId ||
      !memberKey
    ) {
      return "skip";
    }
    return {
      organizationId: activeOrganizationId,
      memberUserKey: memberKey,
    };
  }, [tabVisible, scope.scopeKind, activeOrganizationId, memberKey]);

  useConvexSubMountTrace("ActivityTimeline");
  useConvexSubQueryArgsTrace("ActivityPage:list", listArgs, {
    queryKey: "activityFeed.list",
    route: "activity",
  });
  useConvexSubQueryArgsTrace("ActivityPage:actorKeys", actorKeysArgs, {
    queryKey: "activityFeed.listActorKeys",
    route: "activity",
  });
  useConvexSubQueryArgsTrace("ActivityPage:pipelineLight", pipelineLightArgs, {
    queryKey: "pipeline.listLight",
    route: "activity",
  });

  const page = useQuery(api.activityFeed.list, listArgs);
  const actorKeys = useQuery(api.activityFeed.listActorKeys, actorKeysArgs);
  const pipelineFiles = useQuery(api.pipeline.listLight, pipelineLightArgs);

  const resetFilters = useCallback(() => {
    setCategoryFilter("all");
    setActorFilter("all");
    setFileFilter("all");
    setCursorStack([]);
  }, []);

  const onFilterChange = useCallback(() => {
    setCursorStack([]);
  }, []);

  if (!memberKey) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Set your account ID in preferences to view your activity feed.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <header className="shrink-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Activity className="h-7 w-7 text-muted-foreground" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Live updates across pipeline files, contacts, lenders, and tasks
          {scope.scopeKind === "org" ? " for your team." : " on this account."}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/80 bg-muted/15 p-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter className="h-4 w-4 shrink-0" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wide">
            Filters
          </span>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Type
          <select
            className="h-9 min-w-[8rem] rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.currentTarget.value as typeof categoryFilter);
              onFilterChange();
            }}
          >
            <option value="all">All types</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" aria-hidden />
            User
          </span>
          <select
            className="h-9 min-w-[10rem] max-w-[14rem] rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={actorFilter}
            onChange={(e) => {
              setActorFilter(e.currentTarget.value);
              onFilterChange();
            }}
          >
            <option value="all">Everyone</option>
            {actorKeys?.map((entry: { userKey: string; displayUsername: string }) => (
              <option key={entry.userKey} value={entry.userKey}>
                {entry.displayUsername}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          File
          <select
            className="h-9 w-full min-w-[12rem] rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={fileFilter}
            onChange={(e) => {
              setFileFilter(e.currentTarget.value);
              onFilterChange();
            }}
          >
            <option value="all">All files</option>
            {pipelineFiles?.map((f: { _id: string; fileName?: string | null }) => (
              <option key={f._id} value={f._id}>
                {(f.fileName ?? "Untitled").length > 48
                  ? `${(f.fileName ?? "Untitled").slice(0, 46)}…`
                  : (f.fileName ?? "Untitled")}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mb-px"
          onClick={resetFilters}
        >
          Clear
        </Button>
      </div>

      {page === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <ul className="space-y-2 pr-1" role="list">
            {page.rows.length === 0 ? (
              <li className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No events match these filters.
              </li>
            ) : (
              page.rows.map((row: (typeof page.rows)[number]) => (
                <li
                  key={row._id}
                  className="rounded-lg border border-border/80 bg-background px-3 py-2.5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          categoryBadgeClass(row.category),
                        )}
                      >
                        {categoryLabel(row.category)}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.kind}
                      </span>
                    </div>
                    <time
                      className="shrink-0 text-xs text-muted-foreground tabular-nums"
                      dateTime={new Date(row.at).toISOString()}
                    >
                      {new Date(row.at).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-1.5 text-sm font-medium leading-snug">
                    {row.summary}
                  </p>
                  {row.detail ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {row.detail}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {row.fileId ? (
                      <Link
                        href={pipelineDealEditorHref(row.fileId)}
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Open file
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </Link>
                    ) : null}
                    {row.contactId ? (
                      <Link
                        href="/contacts"
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Contacts
                        <ChevronRight className="h-3 w-3" aria-hidden />
                      </Link>
                    ) : null}
                    {row.lenderId ? (
                      <Link
                        href="/lenders"
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Lenders
                        <ChevronRight className="h-3 w-3" aria-hidden />
                      </Link>
                    ) : null}
                    {row.taskId ? (
                      <Link
                        href="/tasks"
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Tasks
                        <ChevronRight className="h-3 w-3" aria-hidden />
                      </Link>
                    ) : null}
                    <span className="text-muted-foreground">
                      Actor:{" "}
                      <span className="font-medium text-foreground/90">
                        {"actorDisplayUsername" in row &&
                        typeof row.actorDisplayUsername === "string"
                          ? row.actorDisplayUsername
                          : row.actorKey}
                      </span>
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cursorStack.length === 0}
              onClick={() =>
                setCursorStack((s) => s.slice(0, Math.max(0, s.length - 1)))
              }
            >
              Newer
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!page.nextCursor}
              onClick={() => {
                if (page.nextCursor != null) {
                  setCursorStack((s) => [...s, page.nextCursor!]);
                }
              }}
            >
              Older
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ActivityPage() {
  const [queryRecover, setQueryRecover] = useState(0);
  return (
    <ConvexQueryBoundary
      recoverOnKeys={[queryRecover]}
      fallback={
        <div className="space-y-4 p-4 md:p-6">
          <h1 className="text-2xl font-semibold">Activity</h1>
          <div
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-6"
            role="alert"
          >
            <p className="font-medium text-destructive">
              Could not load activity
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Check your connection or deployment, then retry.
            </p>
            <Button
              type="button"
              className="mt-4"
              variant="outline"
              onClick={() => setQueryRecover((n) => n + 1)}
            >
              Retry
            </Button>
          </div>
        </div>
      }
    >
      <ActivityPageInner />
    </ConvexQueryBoundary>
  );
}
