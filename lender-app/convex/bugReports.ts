import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertOrgScopeArgs, resolveMemberUserKey } from "./organizationAccess";
import {
  BUG_REPORT_GITHUB_ISSUES_ENABLED_ENV,
  BUG_REPORT_MAX_DESCRIPTION_CHARS,
  BUG_REPORT_MAX_SCREENSHOT_BYTES,
  BUG_REPORT_MIN_DESCRIPTION_CHARS,
  BUG_REPORT_RATE_LIMIT_PER_HOUR,
  isBugReportGitHubIssuesEnabled,
  normalizeBugReportDescription,
  normalizeBugReportSeverity,
  validateBugReportDescription,
  validateBugReportScreenshotSize,
} from "../lib/bugReportValidation";

const RATE_WINDOW_MS = 60 * 60 * 1000;

const severityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

async function consumeBugReportRateLimit(
  ctx: MutationCtx,
  createdByUserKey: string,
): Promise<void> {
  const key = `bug_report:${createdByUserKey}`;
  const result = await ctx.runMutation(internal.auth.rateLimits.consume, {
    key,
    maxPerWindow: BUG_REPORT_RATE_LIMIT_PER_HOUR,
    windowMs: RATE_WINDOW_MS,
  });
  if (!result.ok) {
    throw new Error(
      `Bug report rate limit reached (${BUG_REPORT_RATE_LIMIT_PER_HOUR} per hour). Try again later.`,
    );
  }
}

/**
 * Optional pipeline context: never hard-fail submit on bad/missing ids.
 * Invalid format, missing row, or cross-org → omit + warn.
 */
async function resolveOptionalPipelineFileId(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  raw: string | undefined,
): Promise<Id<"pipeline"> | undefined> {
  if (!raw?.trim()) return undefined;
  const normalized = ctx.db.normalizeId("pipeline", raw.trim());
  if (!normalized) {
    console.warn(
      "bugReport: ignoring invalid pipelineFileId format (optional context)",
      raw.slice(0, 64),
    );
    return undefined;
  }
  const file = await ctx.db.get(normalized);
  if (!file) {
    console.warn(
      "bugReport: ignoring missing pipelineFileId (optional context)",
      String(normalized),
    );
    return undefined;
  }
  if (file.organizationId && file.organizationId !== organizationId) {
    console.warn(
      "bugReport: ignoring cross-org pipelineFileId (optional context)",
      String(normalized),
    );
    return undefined;
  }
  return normalized;
}

function resolveGitHubTokenPresent(): boolean {
  const primary = process.env.GITHUB_BUG_REPORT_TOKEN?.trim() ?? "";
  if (primary) return true;
  const fallback = process.env.GITHUB_TOKEN?.trim() ?? "";
  return Boolean(fallback);
}

/**
 * Whether submit will attempt GitHub issue creation in the outbound action.
 * Opt-in env + token required. Does not claim success — only that attempt is scheduled.
 * Repo privacy is re-checked in the action before any issue body is posted.
 */
function willAttemptGitHubIssue(): boolean {
  return (
    isBugReportGitHubIssuesEnabled(
      process.env[BUG_REPORT_GITHUB_ISSUES_ENABLED_ENV],
    ) && resolveGitHubTokenPresent()
  );
}

export const generateUploadUrl = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    return await ctx.storage.generateUploadUrl();
  },
});

export const submitBugReport = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    description: v.string(),
    severity: v.optional(severityValidator),
    pageUrl: v.string(),
    pagePath: v.string(),
    /** Optional context only — string so invalid Convex ids do not fail arg validation. */
    pipelineFileId: v.optional(v.string()),
    viewportWidth: v.number(),
    viewportHeight: v.number(),
    userAgent: v.string(),
    reporterEmail: v.optional(v.string()),
    screenshotStorageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    reportId: v.id("bugReports"),
    /** True only when GitHub issue attempt is opted-in and a token is present. */
    githubScheduled: v.boolean(),
    /** True when the one-shot outbound action was scheduled (Convex + webhook path). */
    outboundScheduled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await assertOrgScopeArgs(ctx, args.organizationId, args.memberUserKey);
    const createdByUserKey = await resolveMemberUserKey(
      ctx,
      args.memberUserKey,
    );

    const description = normalizeBugReportDescription(args.description);
    const descErr = validateBugReportDescription(description);
    if (descErr) throw new Error(descErr);
    if (description.length > BUG_REPORT_MAX_DESCRIPTION_CHARS) {
      throw new Error("Description is too long.");
    }
    if (description.length < BUG_REPORT_MIN_DESCRIPTION_CHARS) {
      throw new Error("Description is too short.");
    }

    const pageUrl = args.pageUrl.trim().slice(0, 2_000);
    const pagePath = args.pagePath.trim().slice(0, 500);
    if (!pageUrl || !pagePath) {
      throw new Error("pageUrl and pagePath are required.");
    }

    const viewportWidth = Math.round(args.viewportWidth);
    const viewportHeight = Math.round(args.viewportHeight);
    if (
      !Number.isFinite(viewportWidth) ||
      !Number.isFinite(viewportHeight) ||
      viewportWidth < 1 ||
      viewportHeight < 1 ||
      viewportWidth > 10_000 ||
      viewportHeight > 10_000
    ) {
      throw new Error("Invalid viewport size.");
    }

    const userAgent = args.userAgent.trim().slice(0, 512);
    if (!userAgent) throw new Error("userAgent is required.");

    let screenshotBytes: number | undefined;
    let screenshotMimeType: string | undefined;
    if (args.screenshotStorageId) {
      // Single metadata read — mutations must not sleep/retry-loop.
      const meta = await ctx.storage.getMetadata(args.screenshotStorageId);
      if (!meta) {
        throw new Error(
          "Screenshot upload not found yet. Wait a moment and try re-capturing, then submit again.",
        );
      }
      const sizeErr = validateBugReportScreenshotSize(meta.size);
      if (sizeErr) throw new Error(sizeErr);
      if (meta.size > BUG_REPORT_MAX_SCREENSHOT_BYTES) {
        throw new Error("Screenshot exceeds 4 MB limit.");
      }
      screenshotBytes = meta.size;
      screenshotMimeType = meta.contentType ?? "image/png";
    }

    const pipelineFileId = await resolveOptionalPipelineFileId(
      ctx,
      args.organizationId,
      args.pipelineFileId,
    );

    await consumeBugReportRateLimit(ctx, createdByUserKey);

    const severity = normalizeBugReportSeverity(args.severity);
    const createdAt = Date.now();
    const createdByEmail = args.reporterEmail?.trim().slice(0, 320) || undefined;

    const reportId = await ctx.db.insert("bugReports", {
      organizationId: args.organizationId,
      createdByUserKey,
      createdByEmail,
      description,
      severity,
      status: "new",
      pageUrl,
      pagePath,
      pipelineFileId,
      viewportWidth,
      viewportHeight,
      userAgent,
      screenshotStorageId: args.screenshotStorageId,
      screenshotBytes,
      screenshotMimeType,
      createdAt,
    });

    // One-shot delivery: optional GitHub (gated) then GrokBot webhook (optional).
    // No cron / self-reschedule.
    await ctx.scheduler.runAfter(
      0,
      internal.bugReportActions.deliverBugReportOutbound,
      { reportId },
    );

    const githubScheduled = willAttemptGitHubIssue();
    return {
      reportId,
      githubScheduled,
      outboundScheduled: true,
    };
  },
});

export const listRecentForOrg = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("bugReports"),
      description: v.string(),
      severity: severityValidator,
      status: v.union(
        v.literal("new"),
        v.literal("acknowledged"),
        v.literal("resolved"),
        v.literal("wontfix"),
      ),
      pagePath: v.string(),
      createdAt: v.number(),
      createdByUserKey: v.string(),
      githubIssueUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { organizationId, memberUserKey, limit }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    const take = Math.min(50, Math.max(1, Math.floor(limit ?? 20)));
    const rows = await ctx.db
      .query("bugReports")
      .withIndex("by_org_createdAt", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(take);
    return rows.map((r) => ({
      _id: r._id,
      description: r.description,
      severity: r.severity,
      status: r.status,
      pagePath: r.pagePath,
      createdAt: r.createdAt,
      createdByUserKey: r.createdByUserKey,
      githubIssueUrl: r.githubIssueUrl,
    }));
  },
});

export const internalGetBugReport = internalQuery({
  args: { reportId: v.id("bugReports") },
  handler: async (ctx, { reportId }) => {
    return await ctx.db.get(reportId);
  },
});

export const internalGetScreenshotUrl = internalQuery({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});

/**
 * Compare-and-set claim for outbound delivery.
 * - Already fully delivered → no-op
 * - Claim held within TTL → concurrent run skips (idempotent)
 * - Else claim and proceed; failed runs can retry after TTL
 *
 * GitHub is optional (often permanently skipped). Webhook success + GitHub
 * terminal skip/success counts as fully delivered.
 */
export const internalClaimOutboundDelivery = internalMutation({
  args: { reportId: v.id("bugReports") },
  returns: v.object({
    claimed: v.boolean(),
    alreadyDelivered: v.boolean(),
    skipGithub: v.boolean(),
    skipWebhook: v.boolean(),
  }),
  handler: async (ctx, { reportId }) => {
    const row = await ctx.db.get(reportId);
    if (!row) {
      return {
        claimed: false,
        alreadyDelivered: false,
        skipGithub: true,
        skipWebhook: true,
      };
    }
    const githubTerminalSkip = new Set([
      "github_issues_disabled",
      "missing_token",
      "repo_not_private",
    ]);
    const skipGithub =
      Boolean(row.githubIssueUrl) ||
      githubTerminalSkip.has(row.githubIssueError ?? "");
    const skipWebhook = Boolean(row.webhookDeliveredAt);
    if (skipGithub && skipWebhook) {
      return {
        claimed: false,
        alreadyDelivered: true,
        skipGithub,
        skipWebhook,
      };
    }
    const CLAIM_TTL_MS = 5 * 60 * 1000;
    const claimedAt = row.outboundDeliveryClaimedAt;
    if (
      typeof claimedAt === "number" &&
      Date.now() - claimedAt < CLAIM_TTL_MS
    ) {
      return {
        claimed: false,
        alreadyDelivered: false,
        skipGithub,
        skipWebhook,
      };
    }
    await ctx.db.patch(reportId, {
      outboundDeliveryClaimedAt: Date.now(),
    });
    return {
      claimed: true,
      alreadyDelivered: false,
      skipGithub,
      skipWebhook,
    };
  },
});

export const internalPatchGitHubIssue = internalMutation({
  args: {
    reportId: v.id("bugReports"),
    githubIssueUrl: v.optional(v.string()),
    githubIssueNumber: v.optional(v.number()),
    githubIssueError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reportId);
    if (!row) return null;
    await ctx.db.patch(args.reportId, {
      githubIssueUrl: args.githubIssueUrl,
      githubIssueNumber: args.githubIssueNumber,
      githubIssueError: args.githubIssueError,
    });
    return null;
  },
});

export const internalPatchWebhookDelivery = internalMutation({
  args: {
    reportId: v.id("bugReports"),
    webhookDeliveredAt: v.optional(v.number()),
    webhookError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reportId);
    if (!row) return null;
    await ctx.db.patch(args.reportId, {
      webhookDeliveredAt: args.webhookDeliveredAt,
      webhookError: args.webhookError?.slice(0, 240),
    });
    return null;
  },
});
