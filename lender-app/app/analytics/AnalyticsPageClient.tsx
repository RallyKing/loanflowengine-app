"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BarChart3, RefreshCw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { settingsHref } from "@/lib/settingsRegistry";
import { convexClientErrorMessage } from "@/lib/ui/convexErrorMessage";

type DashboardResult = FunctionReturnType<typeof api.analytics.dashboard>;

function fmtMoney(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function fmtPct(n: number): string {
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function addUtcDays(ms: number, days: number): number {
  return ms + days * 86400000;
}

type Preset = "7d" | "30d" | "90d" | "ytd" | "custom";

function rangeForPreset(
  preset: Preset,
  now: number,
): { start: number; end: number } {
  const end = now;
  if (preset === "7d") return { start: addUtcDays(now, -7), end };
  if (preset === "30d") return { start: addUtcDays(now, -30), end };
  if (preset === "90d") return { start: addUtcDays(now, -90), end };
  if (preset === "ytd") {
    const y = new Date(now).getUTCFullYear();
    const start = Date.UTC(y, 0, 1, 0, 0, 0, 0);
    return { start, end };
  }
  return { start: addUtcDays(now, -30), end };
}

export default function AnalyticsPageClient() {
  const convex = useConvex();
  const { accountId } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const memberKey = accountId.trim();

  const [preset, setPreset] = useState<Preset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [timeField, setTimeField] = useState<"createdAt" | "updatedAt">(
    "createdAt",
  );
  const [attributionUserKey, setAttributionUserKey] = useState("");
  const [fundingTypeFilter, setFundingTypeFilter] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const members = useQuery(
    api.organizations.listMembers,
    activeOrganizationId && memberKey
      ? { organizationId: activeOrganizationId, memberUserKey: memberKey }
      : "skip",
  );

  const loadStats = useCallback(async () => {
    if (!activeOrganizationId || !memberKey) return;
    const now = Date.now();
    let startMs: number;
    let endMs: number;
    if (preset === "custom" && customStart && customEnd) {
      const a = startOfUtcDay(new Date(customStart).getTime());
      const b = startOfUtcDay(new Date(customEnd).getTime()) + 86400000 - 1;
      if (a <= b) {
        startMs = a;
        endMs = b;
      } else {
        startMs = b;
        endMs = a;
      }
    } else {
      const r = rangeForPreset(preset, now);
      startMs = r.start;
      endMs = r.end;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const result = await convex.query(api.analytics.dashboard, {
        organizationId: activeOrganizationId as Id<"organizations">,
        memberUserKey: memberKey,
        startMs,
        endMs,
        now,
        timeField,
        attributionUserKey:
          attributionUserKey.trim() === ""
            ? undefined
            : attributionUserKey.trim(),
        fundingTypeFilter:
          fundingTypeFilter.trim() === ""
            ? undefined
            : fundingTypeFilter.trim(),
      });
      setDashboard(result);
    } catch (err) {
      setLoadError(convexClientErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [
    activeOrganizationId,
    memberKey,
    convex,
    preset,
    customStart,
    customEnd,
    timeField,
    attributionUserKey,
    fundingTypeFilter,
  ]);

  const trendMax = useMemo(() => {
    if (!dashboard?.revenueTrend.length) return 1;
    return Math.max(
      1,
      ...dashboard.revenueTrend.map(
        (p: { netRevenue: number; commission: number }) =>
          p.netRevenue + p.commission,
      ),
    );
  }, [dashboard?.revenueTrend]);

  const stageMax = useMemo(() => {
    if (!dashboard?.stageMix.length) return 1;
    return Math.max(1, ...dashboard.stageMix.map((s: { count: number }) => s.count));
  }, [dashboard?.stageMix]);

  const referralMax = useMemo(() => {
    if (!dashboard?.topReferralSources.length) return 1;
    return Math.max(
      1,
      ...dashboard.topReferralSources.map((r: { fileCount: number }) => r.fileCount),
    );
  }, [dashboard?.topReferralSources]);

  if (!memberKey) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Load your account preferences to view team analytics.
        </p>
      </div>
    );
  }

  if (!activeOrganizationId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <BarChart3 className="h-6 w-6" aria-hidden />
          Analytics
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Choose an active organization in Settings. Metrics use the same file
          visibility rules as your pipeline.
        </p>
        <Link
          href={settingsHref("appearance")}
          className="mt-4 inline-flex h-9 items-center rounded-md border border-border bg-background px-4 text-sm font-medium shadow-sm hover:bg-muted"
        >
          Open settings
        </Link>
      </div>
    );
  }

  const d = dashboard;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BarChart3 className="h-7 w-7" aria-hidden />
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Stats load only when you click Refresh — they do not stay subscribed
          while you work elsewhere. Metrics match pipeline previews and tracked
          revenue fields.
        </p>
      </header>

      <section className="mb-8 rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Filters
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Range</span>
            <Select
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
              aria-label="Time range preset"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="ytd">Year to date (UTC)</option>
              <option value="custom">Custom…</option>
            </Select>
          </div>
          {preset === "custom" ? (
            <>
              <div className="space-y-1.5">
                <span className="text-xs font-medium">Start</span>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  aria-label="Custom range start"
                />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-medium">End</span>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  aria-label="Custom range end"
                />
              </div>
            </>
          ) : null}
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Time field</span>
            <Select
              value={timeField}
              onChange={(e) =>
                setTimeField(e.target.value as "createdAt" | "updatedAt")
              }
              aria-label="Created vs updated"
            >
              <option value="createdAt">File created</option>
              <option value="updatedAt">Last updated</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium">User</span>
            <Select
              value={attributionUserKey}
              onChange={(e) => setAttributionUserKey(e.target.value)}
              aria-label="Filter by assignee or owner"
            >
              <option value="">All members</option>
              {members?.map((m: { userKey: string }) => (
                <option key={m.userKey} value={m.userKey}>
                  {m.userKey === memberKey ? `${m.userKey} (you)` : m.userKey}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium">
              File type (deal funding type)
            </span>
            <Input
              value={fundingTypeFilter}
              onChange={(e) => setFundingTypeFilter(e.target.value)}
              placeholder="Contains… e.g. DSCR, SBA"
              list={
                d?.fundingTypeSuggestions?.length
                  ? "analytics-funding-type-suggestions"
                  : undefined
              }
              aria-label="Funding type contains"
            />
            {d?.fundingTypeSuggestions?.length ? (
              <datalist id="analytics-funding-type-suggestions">
                {d.fundingTypeSuggestions.map((t: string) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="md"
            className="min-h-10"
            disabled={loading}
            onClick={() => void loadStats()}
          >
            <RefreshCw
              className={cn("h-4 w-4", loading && "animate-spin")}
              aria-hidden
            />
            {d ? "Refresh stats" : "Load stats"}
          </Button>
          {loading ? (
            <p className="text-sm text-muted-foreground" role="status">
              Loading metrics…
            </p>
          ) : null}
          {loadError ? (
            <p className="text-sm text-destructive" role="alert">
              {loadError}
            </p>
          ) : null}
        </div>
      </section>

      {d == null ? (
        <p className="text-sm text-muted-foreground" role="status">
          {loading
            ? "Loading metrics…"
            : "Choose filters, then load stats. Nothing runs until you click."}
        </p>
      ) : (
        <>
          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total pipeline value
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtMoney(d.totalPipelineValue)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {d.fileCount} file{d.fileCount === 1 ? "" : "s"} · deal-aware
                funding
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tracked commission
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtMoney(d.totalCommission)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tracked net revenue
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtMoney(d.totalNetRevenue)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Conversion (paid / paying)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtPct(d.conversion.winRatePct)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {d.conversion.paidCount} won · late stage{" "}
                {fmtPct(d.conversion.lateStageRatePct)} (
                {d.conversion.lateStageCount})
              </p>
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            <section className="rounded-lg border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">Revenue trend</h2>
              <p className="text-xs text-muted-foreground">
                UTC week of the same field as the time filter · stacked net +
                commission
              </p>
              <div className="mt-4 flex h-44 items-end gap-1 border-b border-border/60 pb-2">
                {d.revenueTrend.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data in range.</p>
                ) : (
                  d.revenueTrend.map(
                    (pt: {
                      weekStart: number;
                      netRevenue: number;
                      commission: number;
                    }) => {
                    const total = pt.netRevenue + pt.commission;
                    const colH = Math.max(4, (total / trendMax) * 100);
                    const netH =
                      total > 0 ? (pt.netRevenue / total) * colH : 0;
                    const comH =
                      total > 0 ? (pt.commission / total) * colH : 0;
                    return (
                      <div
                        key={pt.weekStart}
                        className="flex min-w-0 flex-1 flex-col items-center justify-end"
                      >
                        <div
                          className="flex w-full max-w-[3rem] flex-col justify-end overflow-hidden rounded-sm"
                          style={{ height: `${colH}%` }}
                          title={`${new Date(pt.weekStart).toLocaleDateString()}: net ${fmtMoney(pt.netRevenue)}, comm ${fmtMoney(pt.commission)}`}
                        >
                          {pt.netRevenue > 0 ? (
                            <div
                              className="w-full bg-primary/85"
                              style={{ height: `${netH}%`, minHeight: 2 }}
                            />
                          ) : null}
                          {pt.commission > 0 ? (
                            <div
                              className="w-full bg-emerald-600/85"
                              style={{ height: `${comH}%`, minHeight: 2 }}
                            />
                          ) : null}
                        </div>
                        <span className="mt-1 max-w-full truncate text-[10px] text-muted-foreground">
                          {new Date(pt.weekStart).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-primary/85" /> Net
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-emerald-600/85" />{" "}
                  Commission
                </span>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">Top referral sources</h2>
              <p className="text-xs text-muted-foreground">
                Deal <code className="text-[11px]">sourceType</code> (lead
                origin)
              </p>
              <ul className="mt-4 space-y-3">
                {d.topReferralSources.length === 0 ? (
                  <li className="text-sm text-muted-foreground">
                    No sources in this set.
                  </li>
                ) : (
                  d.topReferralSources.map(
                    (r: {
                      key: string;
                      label: string;
                      fileCount: number;
                      totalFunding: number;
                    }) => (
                    <li key={r.key} className="flex items-center gap-3 text-sm">
                      <div
                        className="h-2 shrink-0 rounded-full bg-primary/70"
                        style={{
                          width: `${Math.max(
                            10,
                            (r.fileCount / referralMax) * 180,
                          )}px`,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.fileCount} files · {fmtMoney(r.totalFunding)}{" "}
                          volume
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>

          <section className="mt-8 rounded-lg border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Stage mix</h2>
            <p className="text-xs text-muted-foreground">Filtered file count</p>
            <div className="mt-4 space-y-2">
              {d.stageMix.length === 0 ? (
                <p className="text-sm text-muted-foreground">No files.</p>
              ) : (
                d.stageMix.map(
                  (s: { status: string; label: string; count: number }) => (
                  <div key={s.status} className="flex items-center gap-3 text-sm">
                    <div className="w-36 shrink-0 truncate" title={s.label}>
                      {s.label}
                    </div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${(s.count / stageMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 tabular-nums text-muted-foreground">
                      {s.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
