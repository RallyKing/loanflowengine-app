"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { ActivityTimeline } from "@/components/collaboration/ActivityTimeline";
import {
  TriageClockProvider,
  useTriageClockTime,
} from "@/components/providers/TriageClockProvider";
import { cn } from "@/lib/cn";
import { BarChart3, Users } from "lucide-react";

export default function OperationsPage() {
  return (
    <TriageClockProvider>
      <OperationsPageBody />
    </TriageClockProvider>
  );
}

function OperationsPageBody() {
  const { accountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const memberKey = accountId.trim();
  const nowBucket = useTriageClockTime();

  const snapshotArgs = useMemo(
    () =>
      activeOrganizationId && memberKey
        ? {
            organizationId: activeOrganizationId,
            memberUserKey: memberKey,
            nowBucket,
          }
        : ("skip" as const),
    [activeOrganizationId, memberKey, nowBucket],
  );
  const workloadArgs = useMemo(
    () =>
      activeOrganizationId && memberKey
        ? { organizationId: activeOrganizationId, memberUserKey: memberKey }
        : ("skip" as const),
    [activeOrganizationId, memberKey],
  );

  const snapshot = useQuery(
    api.operationalIntelligence.operationsSnapshot,
    snapshotArgs,
  );

  const workload = useQuery(
    api.taskAssigneeIntelligence.teamWorkloadSummary,
    workloadArgs,
  );

  return (
    <PageErrorBoundary>
      <div
        className={cn(
          "mx-auto min-h-0 w-full max-w-7xl flex-1 px-4 py-6 sm:px-6",
        )}
      >
        <header className="mb-6 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" aria-hidden />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Operations center
              </h1>
              <p className="text-sm text-muted-foreground">
                Live coordination — presence, workload, and recent operational
                events. Requires an active organization.
              </p>
            </div>
          </div>
        </header>

        {!activeOrganizationId ? (
          <p className="text-sm text-muted-foreground">
            Select an organization to load operational intelligence.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" aria-hidden />
                Live snapshot
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Active operators</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {snapshot?.activeUsers ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Occupied files</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {snapshot?.occupiedFiles ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Open tasks</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {snapshot?.openTasks ?? workload?.openTaskCount ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Aging tasks (3d+)</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {snapshot?.agingTasks ?? "—"}
                  </dd>
                </div>
              </dl>
              {workload ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Unassigned open: {workload.unassignedOpenTasks} · imbalance
                  spread: {workload.imbalance}
                </p>
              ) : null}
            </section>

            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">Recent collaboration</h2>
              <ul className="mt-2 max-h-60 space-y-2 overflow-y-auto text-xs">
                {(snapshot?.recentEvents ?? []).map((e: { _id: string; summary: string; actorUserKey: string; at: number }) => (
                  <li
                    key={e._id}
                    className="rounded-md border border-border/60 px-2 py-1.5"
                  >
                    <div className="font-medium">{e.summary}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {e.actorUserKey} · {new Date(e.at).toLocaleString()}
                    </div>
                  </li>
                ))}
                {!snapshot?.recentEvents?.length ? (
                  <li className="text-muted-foreground">No events yet.</li>
                ) : null}
              </ul>
              <Link
                href="/activity"
                className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
              >
                Open full activity feed
              </Link>
            </section>

            <section className="lg:col-span-2">
              <ActivityTimeline
                organizationId={activeOrganizationId}
                memberUserKey={memberKey}
                className="min-h-[20rem]"
              />
            </section>
          </div>
        )}
      </div>
    </PageErrorBoundary>
  );
}
