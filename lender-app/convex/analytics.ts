import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { embeddedDealPayloadIsSubstantive } from "../lib/file/embeddedDealPresence";
import type { PipelineFileSharedSource } from "../lib/fileSharedFields";
import { revenueAttributionUserKey, revenueTotalsFromPipelineRow } from "../lib/fileRevenue";
import { pickIntakeShapedPreviewPayload } from "../lib/pipeline/pickIntakeShapedPreviewPayload";
import { resolvePipelineTableFundingAmount } from "../lib/pipeline/resolvePipelineTableFundingAmount";
import {
  getPipelineStatusInfo,
  isPaidStatus,
} from "../lib/pipelineStatus";
import { isCurrentlySnoozed as pipelineIsCurrentlySnoozed } from "../lib/pipelineSnooze";
import { assertOrgMember, filterPipelineRowsForMember, sessionKeyIsGlobalAdmin } from "./organizationAccess";

function trimStr(x: unknown): string {
  if (x == null) return "";
  if (typeof x !== "string") return String(x).trim();
  return x.trim();
}

function resolveDealPayloadForPreview(
  p: Doc<"pipeline">,
  intakeById: Map<Id<"intakeSheets">, Doc<"intakeSheets">>,
): Doc<"intakeSheets"> | null {
  const linked = p.intakeSheetId
    ? (intakeById.get(p.intakeSheetId) ?? null)
    : null;
  const embedded = embeddedDealPayloadIsSubstantive(p.dealData)
    ? (p.dealData as Doc<"intakeSheets">)
    : null;
  return pickIntakeShapedPreviewPayload(embedded, linked, p.updatedAt);
}

/** Monday 00:00 UTC for the week containing `ms`. */
function startOfUtcWeekMonday(ms: number): number {
  const d = new Date(ms);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export type AnalyticsReferralRow = {
  key: string;
  label: string;
  fileCount: number;
  totalFunding: number;
};

export type AnalyticsTrendPoint = {
  weekStart: number;
  netRevenue: number;
  commission: number;
  files: number;
};

export type AnalyticsStageMixRow = {
  status: string;
  label: string;
  weight: number;
  count: number;
};

/**
 * Single-round-trip dashboard metrics for org-scoped pipeline data.
 * Loads org files via `by_organization_createdAt`, applies membership visibility,
 * batches intakes once, then aggregates in memory (accurate; bounded to org size).
 */
export const dashboard = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    startMs: v.number(),
    endMs: v.number(),
    timeField: v.optional(
      v.union(v.literal("createdAt"), v.literal("updatedAt")),
    ),
    /** When set, only files attributed to this user (assignee → owner). */
    attributionUserKey: v.optional(v.string()),
    /** Case-insensitive substring match on deal root `fundingType`. */
    fundingTypeFilter: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
    includeSnoozed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // `assertOrgMember` resolves the canonical member identity (arg → JWT →
    // single-user fallback) so the dashboard works for cookie-auth callers
    // that don't thread `memberUserKey` from the client.
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey ?? "");

    let startMs = args.startMs;
    let endMs = args.endMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw new Error("Invalid time range.");
    }
    if (startMs > endMs) {
      const t = startMs;
      startMs = endMs;
      endMs = t;
    }

    const timeField = args.timeField ?? "createdAt";
    const includeArchived = args.includeArchived === true;
    const includeSnoozed = args.includeSnoozed === true;
    const now = Date.now();

    const god = await sessionKeyIsGlobalAdmin(ctx, args.memberUserKey);
    const allOrg = god
      ? await ctx.db.query("pipeline").collect()
      : await ctx.db
          .query("pipeline")
          .withIndex("by_organization_createdAt", (q) =>
            q.eq("organizationId", args.organizationId),
          )
          .collect();

    const visible = await filterPipelineRowsForMember(
      ctx,
      allOrg,
      args.organizationId,
      args.memberUserKey,
    );

    const timeFiltered = visible.filter((row) => {
      if (!includeArchived && row.archivedAt != null) return false;
      if (!includeSnoozed && pipelineIsCurrentlySnoozed(row.snoozedUntil, now)) {
        return false;
      }
      const t = timeField === "updatedAt" ? row.updatedAt : row.createdAt;
      return t >= startMs && t <= endMs;
    });

    const intakeIds = new Set<Id<"intakeSheets">>();
    for (const r of timeFiltered) {
      if (r.intakeSheetId) intakeIds.add(r.intakeSheetId);
    }
    const intakeDocs = await Promise.all(
      [...intakeIds].map((id) => ctx.db.get(id)),
    );
    const intakeById = new Map(
      intakeDocs
        .filter((d): d is Doc<"intakeSheets"> => d != null)
        .map((d) => [d._id, d]),
    );

    const attrib = args.attributionUserKey?.trim();
    const ftNorm = args.fundingTypeFilter?.trim().toLowerCase() ?? "";

    const fundingTypeSuggestions = new Set<string>();
    const filtered: Doc<"pipeline">[] = [];

    for (const row of timeFiltered) {
      const deal = resolveDealPayloadForPreview(row, intakeById);
      const ft = trimStr(deal?.fundingType);
      if (ft) fundingTypeSuggestions.add(ft);

      if (attrib && revenueAttributionUserKey(row) !== attrib) {
        continue;
      }
      if (ftNorm) {
        if (!trimStr(deal?.fundingType).toLowerCase().includes(ftNorm)) {
          continue;
        }
      }
      filtered.push(row);
    }

    let totalPipelineValue = 0;
    let totalCommission = 0;
    let totalNetRevenue = 0;
    let paidCount = 0;
    let lateStageCount = 0;

    const referralMap = new Map<
      string,
      { label: string; fileCount: number; totalFunding: number }
    >();
    const trendMap = new Map<
      number,
      { weekStart: number; netRevenue: number; commission: number; files: number }
    >();
    const stageMap = new Map<
      string,
      { label: string; weight: number; count: number }
    >();

    for (const row of filtered) {
      const deal = resolveDealPayloadForPreview(row, intakeById);
      const fund = resolvePipelineTableFundingAmount(deal, row);
      totalPipelineValue += fund;

      const rev = revenueTotalsFromPipelineRow(
        row as unknown as PipelineFileSharedSource,
      );
      totalCommission += rev.commission;
      totalNetRevenue += rev.netRevenue;

      if (isPaidStatus(row.status)) paidCount += 1;
      const info = getPipelineStatusInfo(row.status);
      if (info.weight >= 7) lateStageCount += 1;

      const stRaw = trimStr(deal?.sourceType);
      const rKey = stRaw ? stRaw.toLowerCase() : "__unknown__";
      const rLabel = stRaw || "Unknown";
      const rp = referralMap.get(rKey) ?? {
        label: rLabel,
        fileCount: 0,
        totalFunding: 0,
      };
      rp.fileCount += 1;
      rp.totalFunding += fund;
      if (!rp.label && rLabel) rp.label = rLabel;
      referralMap.set(rKey, rp);

      const cohortT =
        timeField === "updatedAt" ? row.updatedAt : row.createdAt;
      const wk = startOfUtcWeekMonday(cohortT);
      const tp = trendMap.get(wk) ?? {
        weekStart: wk,
        netRevenue: 0,
        commission: 0,
        files: 0,
      };
      tp.netRevenue += rev.netRevenue;
      tp.commission += rev.commission;
      tp.files += 1;
      trendMap.set(wk, tp);

      const sv = info.value;
      const sp = stageMap.get(sv) ?? {
        label: info.label,
        weight: info.weight,
        count: 0,
      };
      sp.count += 1;
      stageMap.set(sv, sp);
    }

    const fileCount = filtered.length;
    const winRatePct = fileCount > 0 ? (paidCount / fileCount) * 100 : 0;
    const lateStageRatePct =
      fileCount > 0 ? (lateStageCount / fileCount) * 100 : 0;

    const topReferralSources: AnalyticsReferralRow[] = [...referralMap.entries()]
      .map(([rk, v]) => ({
        key: rk,
        label: v.label,
        fileCount: v.fileCount,
        totalFunding: Math.round(v.totalFunding * 100) / 100,
      }))
      .sort(
        (a, b) =>
          b.fileCount - a.fileCount ||
          b.totalFunding - a.totalFunding ||
          a.label.localeCompare(b.label),
      )
      .slice(0, 10);

    const revenueTrend: AnalyticsTrendPoint[] = [...trendMap.values()]
      .map((p) => ({
        weekStart: p.weekStart,
        netRevenue: Math.round(p.netRevenue * 100) / 100,
        commission: Math.round(p.commission * 100) / 100,
        files: p.files,
      }))
      .sort((a, b) => a.weekStart - b.weekStart);

    const stageMix: AnalyticsStageMixRow[] = [...stageMap.entries()]
      .map(([status, v]) => ({
        status,
        label: v.label,
        weight: v.weight,
        count: v.count,
      }))
      .sort((a, b) => a.weight - b.weight || b.count - a.count);

    return {
      fileCount,
      totalPipelineValue: Math.round(totalPipelineValue * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      totalNetRevenue: Math.round(totalNetRevenue * 100) / 100,
      conversion: {
        winRatePct: Math.round(winRatePct * 10) / 10,
        paidCount,
        lateStageRatePct: Math.round(lateStageRatePct * 10) / 10,
        lateStageCount,
      },
      revenueTrend,
      topReferralSources,
      stageMix,
      fundingTypeSuggestions: [...fundingTypeSuggestions]
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 40),
      applied: {
        timeField,
        startMs,
        endMs,
        includeArchived,
        includeSnoozed,
      },
    };
  },
});
