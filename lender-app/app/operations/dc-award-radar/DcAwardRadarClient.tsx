"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Radar } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { Label, Select } from "@/components/ui/Input";
import { OperationalEmptyState } from "@/components/ui/OperationalEmptyState";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { cn } from "@/lib/cn";
import { dataTableClassNames } from "@/lib/dataTableClasses";
import {
  DC_AWARD_RADAR_CONFIDENCE,
  DC_AWARD_RADAR_MARKETS,
  type DcAwardRadarConfidence,
} from "@/lib/dcAwardRadar";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useUserPreferences } from "@/lib/userPreferencesContext";

const CONFIDENCE_LABEL: Record<DcAwardRadarConfidence, string> = {
  high: "High",
  med: "Med",
  low: "Low",
};

function ConfidenceBadge({ value }: { value: DcAwardRadarConfidence }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        value === "high" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
        value === "med" && "bg-amber-500/15 text-amber-800 dark:text-amber-200",
        value === "low" && "bg-muted text-muted-foreground",
      )}
    >
      {CONFIDENCE_LABEL[value]}
    </span>
  );
}

function RadarTable() {
  const memberUserKey = useActorUserKey().trim();
  const { settings } = useUserPreferences();
  const [market, setMarket] = useState("");
  const [confidence, setConfidence] = useState<"" | DcAwardRadarConfidence>("");

  const result = useQuery(
    api.dcAwardSignals.list,
    memberUserKey
      ? {
          memberUserKey,
          ...(market ? { market } : {}),
          ...(confidence ? { confidence } : {}),
        }
      : "skip",
  );

  const signals = result?.signals;
  const markets = useMemo(() => {
    const fromData = new Set<string>(DC_AWARD_RADAR_MARKETS);
    for (const row of signals ?? []) {
      if (row.market) fromData.add(row.market);
    }
    return [...fromData].sort((a, b) => a.localeCompare(b));
  }, [signals]);

  if (!memberUserKey) {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in to load award-radar signals.
      </p>
    );
  }

  if (signals === undefined) {
    return <OperationalSkeletonList rows={6} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Label className="min-w-[12rem] flex-1">
          Market
          <Select
            aria-label="Filter by market"
            value={market}
            onChange={(event) => setMarket(event.target.value)}
          >
            <option value="">All markets</option>
            {markets.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Label>
        <Label className="min-w-[10rem]">
          Confidence
          <Select
            aria-label="Filter by confidence"
            value={confidence}
            onChange={(event) =>
              setConfidence(
                event.target.value as "" | DcAwardRadarConfidence,
              )
            }
          >
            <option value="">All confidence</option>
            {DC_AWARD_RADAR_CONFIDENCE.map((item) => (
              <option key={item} value={item}>
                {CONFIDENCE_LABEL[item]}
              </option>
            ))}
          </Select>
        </Label>
        <p className="text-xs text-muted-foreground sm:ml-auto">
          {signals.length} signal{signals.length === 1 ? "" : "s"}
          {result.truncated ? " (list capped)" : ""}
        </p>
      </div>

      {signals.length === 0 ? (
        <OperationalEmptyState
          title="No award signals"
          description="Nothing matches these filters. Run the one-shot Phase 2 import if the table is empty."
        />
      ) : (
        <div className="overflow-x-auto max-md:touch-pan-x">
          <table
            className={dataTableClassNames(settings.tableDensity, "w-full min-w-[72rem] text-left")}
          >
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="sticky top-0 bg-card px-2 py-2 font-medium">Market</th>
                <th className="sticky top-0 bg-card px-2 py-2 font-medium">Project</th>
                <th className="sticky top-0 bg-card px-2 py-2 font-medium">Stage</th>
                <th className="sticky top-0 bg-card px-2 py-2 font-medium">Company</th>
                <th className="sticky top-0 bg-card px-2 py-2 font-medium">Conf.</th>
                <th className="sticky top-0 bg-card px-2 py-2 font-medium">Date</th>
                <th className="sticky top-0 bg-card px-2 py-2 font-medium">Why it matters</th>
                <th className="sticky top-0 bg-card px-2 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((row) => (
                <tr key={row._id} className="border-b border-border/60 align-top">
                  <td className="px-2 py-2 text-xs whitespace-nowrap">{row.market}</td>
                  <td className="px-2 py-2 text-sm font-medium">{row.projectOrCampus}</td>
                  <td className="px-2 py-2 text-xs">{row.stageSignal}</td>
                  <td className="px-2 py-2 text-xs">
                    <div>{row.company}</div>
                    <div className="text-muted-foreground">{row.roleIfKnown}</div>
                  </td>
                  <td className="px-2 py-2">
                    <ConfidenceBadge value={row.confidence} />
                  </td>
                  <td className="px-2 py-2 text-xs whitespace-nowrap">{row.signalDate}</td>
                  <td className="px-2 py-2 text-xs">
                    <div>{row.whyItMattersForDlc}</div>
                    {row.notes ? (
                      <div className="mt-1 text-muted-foreground">{row.notes}</div>
                    ) : null}
                    <div className="mt-1 text-muted-foreground">{row.tradeFocus}</div>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <div>{row.sourceType}</div>
                    <a
                      href={row.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-primary hover:underline"
                    >
                      Open source
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DcAwardRadarClient() {
  return (
    <PageErrorBoundary>
      <div className="mx-auto min-h-0 w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <header className="mb-6 border-b border-border pb-4">
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
            <Link href="/operations" className="hover:text-foreground hover:underline">
              Operations
            </Link>
            <span aria-hidden> › </span>
            <span className="font-medium text-foreground">DC award radar</span>
          </nav>
          <div className="flex flex-wrap items-start gap-3">
            <Radar className="mt-0.5 h-8 w-8 text-primary" aria-hidden />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Data-center award radar
              </h1>
              <p className="text-sm text-muted-foreground">
                Public permit, registration, and construction signals for DLC.
                Read-only. GHL sync and outbound messages are out of scope.
              </p>
            </div>
          </div>
        </header>
        <ConvexQueryBoundary
          fallback={
            <p className="text-sm text-destructive">
              Could not load award-radar signals. Refresh after Convex has this
              function deployed.
            </p>
          }
        >
          <RadarTable />
        </ConvexQueryBoundary>
      </div>
    </PageErrorBoundary>
  );
}
