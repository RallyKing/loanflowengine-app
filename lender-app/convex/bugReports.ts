import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertOrgScopeArgs, resolveMemberUserKey } from "./organizationAccess";
import {
  BUG_REPORT_MAX_DESCRIPTION_CHARS,
  BUG_REPORT_MAX_SCREENSHOT_BYTES,
  BUG_REPORT_MIN_DESCRIPTION_CHARS,
  BUG_REPORT_RATE_LIMIT_PER_HOUR,
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

async function getStorageMetadataWithRetry(
  storage: MutationCtx["storage"],
  storageId: Id<"_storage">,
  { attempts = 12, delayMs = 80 }: { attempts?: number; delayMs?: number } = {},
) {
  for (let i = 0; i < attempts; i++) {
    const meta = await storage.getMetadata(storageId);
    if (meta) return meta;
    if (i < attempts - 1) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

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
    pipelineFileId: v.optional(v.id("pipeline")),
    viewportWidth: v.number(),
    viewportHeight: v.number(),
    userAgent: v.string(),
    reporterEmail: v.optional(v.string()),
    screenshotStorageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    reportId: v.id("bugReports"),
    githubScheduled: v.boolean(),
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
      const meta = await getStorageMetadataWithRetry(
        ctx.storage,
        args.screenshotStorageId,
      );
      if (!meta) {
        throw new Error("Screenshot upload not found. Try re-capturing.");
      }
      const sizeErr = validateBugReportScreenshotSize(meta.size);
      if (sizeErr) throw new Error(sizeErr);
      if (meta.size > BUG_REPORT_MAX_SCREENSHOT_BYTES) {
        throw new Error("Screenshot exceeds 4 MB limit.");
      }
      screenshotBytes = meta.size;
      screenshotMimeType = meta.contentType ?? "image/png";
    }

    if (args.pipelineFileId) {
      const file = await ctx.db.get(args.pipelineFileId);
      if (!file) {
        throw new Error("Pipeline file not found.");
      }
      if (
        file.organizationId &&
        file.organizationId !== args.organizationId
      ) {
        throw new Error("Pipeline file belongs to a different organization.");
      }
    }

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
      pipelineFileId: args.pipelineFileId,
      viewportWidth,
      viewportHeight,
      userAgent,
      screenshotStorageId: args.screenshotStorageId,
      screenshotBytes,
      screenshotMimeType,
      createdAt,
    });

    // One-shot delivery to GitHub (no cron / self-reschedule).
    await ctx.scheduler.runAfter(
      0,
      internal.bugReportActions.createGitHubIssueForBugReport,
      { reportId },
    );

    return { reportId, githubScheduled: true };
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
