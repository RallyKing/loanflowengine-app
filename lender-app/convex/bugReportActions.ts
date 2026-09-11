"use node";

/**
 * One-shot outbound delivery for in-app bug reports:
 * 1) optional GitHub issue
 * 2) optional GrokBot / Cursor Cloud Minion webhook
 *
 * Fired via `scheduler.runAfter(0, …)` from `submitBugReport`.
 * Never self-reschedules. Never cron.
 */
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { buildBugReportGitHubTitle } from "../lib/bugReportValidation";

const GITHUB_REPO = "RallyKing/loanflowengine-app";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/issues`;

function resolveGitHubToken(): string | null {
  const primary = process.env.GITHUB_BUG_REPORT_TOKEN?.trim() ?? "";
  if (primary) return primary;
  const fallback = process.env.GITHUB_TOKEN?.trim() ?? "";
  return fallback || null;
}

function resolveGrokBotWebhookUrl(): string | null {
  const url = process.env.GROKBOT_BUG_INTAKE_WEBHOOK_URL?.trim() ?? "";
  return url || null;
}

/**
 * Prefer full Authorization header from routine panel env.
 * Else Bearer from key env. Never log the resolved value.
 */
function resolveGrokBotAuthorizationHeader(): string | null {
  const raw =
    process.env.GROKBOT_BUG_INTAKE_WEBHOOK_AUTHORIZATION?.trim() ?? "";
  if (raw) return raw;
  const key = process.env.GROKBOT_BUG_INTAKE_WEBHOOK_KEY?.trim() ?? "";
  if (!key) return null;
  if (/^bearer\s+/i.test(key)) return key;
  return `Bearer ${key}`;
}

function buildIssueBody(args: {
  description: string;
  pageUrl: string;
  pagePath: string;
  pipelineFileId?: string;
  viewportWidth: number;
  viewportHeight: number;
  userAgent: string;
  createdByUserKey: string;
  createdByEmail?: string;
  severity: string;
  createdAt: number;
  reportId: string;
  screenshotUrl: string | null;
}): string {
  const lines: string[] = [
    "## Description",
    args.description,
    "",
    "## Metadata",
    `- **Severity:** ${args.severity}`,
    `- **Report id:** \`${args.reportId}\``,
    `- **Page URL:** ${args.pageUrl}`,
    `- **Path:** \`${args.pagePath}\``,
    `- **Pipeline file id:** ${args.pipelineFileId ? `\`${args.pipelineFileId}\`` : "_none_"}`,
    `- **Viewport:** ${args.viewportWidth}×${args.viewportHeight}`,
    `- **User agent:** \`${args.userAgent.replace(/`/g, "'")}\``,
    `- **Reporter user key:** \`${args.createdByUserKey}\``,
    `- **Reporter email:** ${args.createdByEmail ?? "_unknown_"}`,
    `- **Created at:** ${new Date(args.createdAt).toISOString()}`,
    "",
    "## Screenshot",
  ];

  if (args.screenshotUrl) {
    lines.push(
      "Convex storage URL (short-lived — download promptly):",
      "",
      args.screenshotUrl,
      "",
      "If the link expired, open the report in Convex `bugReports` and regenerate via `storage.getUrl`.",
    );
  } else {
    lines.push("_No screenshot attached._");
  }

  lines.push(
    "",
    "---",
    "_Submitted via LFE in-app **Report a bug**. Cursor Cloud Minion / GrokBot: triage from this issue._",
  );

  return lines.join("\n");
}

async function createGitHubIssue(
  ctx: ActionCtx,
  reportId: Id<"bugReports">,
  report: {
    description: string;
    pageUrl: string;
    pagePath: string;
    pipelineFileId?: Id<"pipeline">;
    viewportWidth: number;
    viewportHeight: number;
    userAgent: string;
    createdByUserKey: string;
    createdByEmail?: string;
    severity: string;
    createdAt: number;
  },
  screenshotUrl: string | null,
): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  issueUrl?: string;
}> {
  const token = resolveGitHubToken();
  if (!token) {
    console.warn(
      "bugReport: GITHUB_BUG_REPORT_TOKEN (or GITHUB_TOKEN) not set on Convex; skipping GitHub issue. Report remains in Convex bugReports.",
    );
    await ctx.runMutation(internal.bugReports.internalPatchGitHubIssue, {
      reportId,
      githubIssueError: "missing_token",
    });
    return { ok: false, skipped: true, reason: "missing_token" };
  }

  const title = buildBugReportGitHubTitle(report.description);
  const body = buildIssueBody({
    description: report.description,
    pageUrl: report.pageUrl,
    pagePath: report.pagePath,
    pipelineFileId: report.pipelineFileId
      ? String(report.pipelineFileId)
      : undefined,
    viewportWidth: report.viewportWidth,
    viewportHeight: report.viewportHeight,
    userAgent: report.userAgent,
    createdByUserKey: report.createdByUserKey,
    createdByEmail: report.createdByEmail,
    severity: report.severity,
    createdAt: report.createdAt,
    reportId: String(reportId),
    screenshotUrl,
  });

  try {
    const res = await fetch(GITHUB_API, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "loanflowengine-bug-reports",
      },
      body: JSON.stringify({
        title,
        body,
        labels: ["lfe-bug-report", "bug"],
        // Wake GrokBot / Cursor Cloud Minion via GitHub `issue-assigned` routine.
        assignees: ["RallyKing"],
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      const errSnippet = text.slice(0, 400);
      console.error(
        "bugReport: GitHub issue create failed",
        res.status,
        errSnippet,
      );
      await ctx.runMutation(internal.bugReports.internalPatchGitHubIssue, {
        reportId,
        githubIssueError: `http_${res.status}:${errSnippet.slice(0, 200)}`,
      });
      return { ok: false, reason: `http_${res.status}` };
    }

    let issueUrl: string | undefined;
    let issueNumber: number | undefined;
    try {
      const parsed = JSON.parse(text) as {
        html_url?: unknown;
        number?: unknown;
      };
      if (typeof parsed.html_url === "string") issueUrl = parsed.html_url;
      if (typeof parsed.number === "number") issueNumber = parsed.number;
    } catch {
      /* ignore parse errors — issue may still exist */
    }

    await ctx.runMutation(internal.bugReports.internalPatchGitHubIssue, {
      reportId,
      githubIssueUrl: issueUrl,
      githubIssueNumber: issueNumber,
    });

    return { ok: true, issueUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("bugReport: GitHub issue create threw", message);
    await ctx.runMutation(internal.bugReports.internalPatchGitHubIssue, {
      reportId,
      githubIssueError: message.slice(0, 240),
    });
    return { ok: false, reason: message };
  }
}

async function postGrokBotWebhook(
  ctx: ActionCtx,
  reportId: Id<"bugReports">,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  const url = resolveGrokBotWebhookUrl();
  if (!url) {
    console.warn(
      "bugReport: GROKBOT_BUG_INTAKE_WEBHOOK_URL not set on Convex; skipping GrokBot webhook. Report remains in Convex bugReports.",
    );
    await ctx.runMutation(internal.bugReports.internalPatchWebhookDelivery, {
      reportId,
      webhookError: "missing_url",
    });
    return { ok: false, skipped: true, reason: "missing_url" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "loanflowengine-bug-reports",
  };
  const authorization = resolveGrokBotAuthorizationHeader();
  if (authorization) {
    headers.Authorization = authorization;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Never log Authorization / secrets — status + body snippet only.
      const errBody = (await res.text()).slice(0, 300);
      console.error("bugReport: GrokBot webhook failed", res.status, errBody);
      await ctx.runMutation(internal.bugReports.internalPatchWebhookDelivery, {
        reportId,
        webhookError: `http_${res.status}`,
      });
      return { ok: false, reason: `http_${res.status}` };
    }

    await ctx.runMutation(internal.bugReports.internalPatchWebhookDelivery, {
      reportId,
      webhookDeliveredAt: Date.now(),
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("bugReport: GrokBot webhook threw", message);
    await ctx.runMutation(internal.bugReports.internalPatchWebhookDelivery, {
      reportId,
      webhookError: message.slice(0, 240),
    });
    return { ok: false, reason: message };
  }
}

/**
 * One-shot outbound: GitHub (if token) then GrokBot webhook (if URL).
 * Webhook payload includes `githubIssueUrl` when GitHub create succeeded.
 * Does not reschedule itself.
 */
export const deliverBugReportOutbound = internalAction({
  args: { reportId: v.id("bugReports") },
  returns: v.object({
    github: v.object({
      ok: v.boolean(),
      skipped: v.optional(v.boolean()),
      reason: v.optional(v.string()),
      issueUrl: v.optional(v.string()),
    }),
    webhook: v.object({
      ok: v.boolean(),
      skipped: v.optional(v.boolean()),
      reason: v.optional(v.string()),
    }),
  }),
  handler: async (ctx, { reportId }) => {
    const report = await ctx.runQuery(internal.bugReports.internalGetBugReport, {
      reportId,
    });
    if (!report) {
      return {
        github: { ok: false, reason: "not_found" },
        webhook: { ok: false, reason: "not_found" },
      };
    }

    let screenshotUrl: string | null = null;
    if (report.screenshotStorageId) {
      screenshotUrl = await ctx.runQuery(
        internal.bugReports.internalGetScreenshotUrl,
        { storageId: report.screenshotStorageId },
      );
    }

    const github = await createGitHubIssue(
      ctx,
      reportId,
      report,
      screenshotUrl,
    );

    const webhookPayload = {
      reportId: String(reportId),
      description: report.description,
      severity: report.severity,
      pageUrl: report.pageUrl,
      pagePath: report.pagePath,
      pipelineFileId: report.pipelineFileId
        ? String(report.pipelineFileId)
        : null,
      viewportWidth: report.viewportWidth,
      viewportHeight: report.viewportHeight,
      userAgent: report.userAgent,
      createdByUserKey: report.createdByUserKey,
      createdByEmail: report.createdByEmail ?? null,
      createdAt: report.createdAt,
      screenshotUrl,
      githubIssueUrl: github.issueUrl ?? report.githubIssueUrl ?? null,
      organizationId: String(report.organizationId),
      source: "lfe_in_app_bug_report",
    };

    const webhook = await postGrokBotWebhook(ctx, reportId, webhookPayload);

    return {
      github: {
        ok: github.ok,
        skipped: github.skipped,
        reason: github.reason,
        issueUrl: github.issueUrl,
      },
      webhook: {
        ok: webhook.ok,
        skipped: webhook.skipped,
        reason: webhook.reason,
      },
    };
  },
});

/**
 * Back-compat alias if anything still schedules the old name.
 * Same one-shot handler — no reschedule.
 */
export const createGitHubIssueForBugReport = deliverBugReportOutbound;
