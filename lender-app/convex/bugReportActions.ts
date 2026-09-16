"use node";

/**
 * One-shot outbound delivery for in-app bug reports:
 * 1) optional GitHub issue (opt-in + private repo only; text-only body)
 * 2) optional GrokBot / Cursor Cloud Minion webhook (primary triage path)
 *
 * Fired via `scheduler.runAfter(0, …)` from `submitBugReport`.
 * Never self-reschedules. Never cron.
 * Idempotent: claim + skip if GitHub/webhook already succeeded.
 */
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  BUG_REPORT_GITHUB_ISSUES_ENABLED_ENV,
  buildBugReportGitHubIssueBody,
  buildBugReportGitHubTitle,
  isBugReportGitHubIssuesEnabled,
} from "../lib/bugReportValidation";

const DEFAULT_GITHUB_REPO = "RallyKing/loanflowengine-app";

function resolveGitHubRepo(): string {
  const fromEnv = process.env.BUG_REPORT_GITHUB_REPO?.trim() ?? "";
  return fromEnv || DEFAULT_GITHUB_REPO;
}

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

type GitHubResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  issueUrl?: string;
};

/**
 * Confirm the target repo is private before posting any issue body.
 * Public / unknown → refuse (PII / screenshot risk).
 */
async function assertGitHubRepoIsPrivate(
  token: string,
  repo: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "loanflowengine-bug-reports",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(
        "bugReport: GitHub repo visibility check failed",
        res.status,
        text.slice(0, 200),
      );
      return { ok: false, reason: `repo_check_http_${res.status}` };
    }
    let isPrivate = false;
    try {
      const parsed = JSON.parse(text) as { private?: unknown };
      isPrivate = parsed.private === true;
    } catch {
      return { ok: false, reason: "repo_check_parse_error" };
    }
    if (!isPrivate) {
      console.warn(
        "bugReport: refusing GitHub issue — target repo is not private:",
        repo,
      );
      return { ok: false, reason: "repo_not_private" };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("bugReport: GitHub repo visibility check threw", message);
    return { ok: false, reason: `repo_check_${message.slice(0, 80)}` };
  }
}

async function createGitHubIssue(
  ctx: ActionCtx,
  reportId: Id<"bugReports">,
  report: {
    description: string;
    pagePath: string;
    viewportWidth: number;
    viewportHeight: number;
    severity: string;
    createdAt: number;
    githubIssueUrl?: string;
  },
): Promise<GitHubResult> {
  // Idempotent: already created.
  if (report.githubIssueUrl) {
    return {
      ok: true,
      skipped: true,
      reason: "already_created",
      issueUrl: report.githubIssueUrl,
    };
  }

  if (
    !isBugReportGitHubIssuesEnabled(
      process.env[BUG_REPORT_GITHUB_ISSUES_ENABLED_ENV],
    )
  ) {
    console.warn(
      "bugReport: GitHub issues disabled (set BUG_REPORT_GITHUB_ISSUES_ENABLED=true only for a private intake repo). Primary path: Convex + GrokBot webhook.",
    );
    await ctx.runMutation(internal.bugReports.internalPatchGitHubIssue, {
      reportId,
      githubIssueError: "github_issues_disabled",
    });
    return { ok: false, skipped: true, reason: "github_issues_disabled" };
  }

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

  const repo = resolveGitHubRepo();
  const privacy = await assertGitHubRepoIsPrivate(token, repo);
  if (!privacy.ok) {
    await ctx.runMutation(internal.bugReports.internalPatchGitHubIssue, {
      reportId,
      githubIssueError: privacy.reason,
    });
    return { ok: false, skipped: true, reason: privacy.reason };
  }

  // Text-only public-safe body: no screenshot URL, no pipeline file id, no PII.
  const title = buildBugReportGitHubTitle(report.description);
  const body = buildBugReportGitHubIssueBody({
    description: report.description,
    pagePath: report.pagePath,
    viewportWidth: report.viewportWidth,
    viewportHeight: report.viewportHeight,
    severity: report.severity,
    createdAt: report.createdAt,
    reportId: String(reportId),
  });

  const api = `https://api.github.com/repos/${repo}/issues`;

  try {
    const res = await fetch(api, {
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
  alreadyDeliveredAt: number | undefined,
): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  if (alreadyDeliveredAt) {
    return { ok: true, skipped: true, reason: "already_delivered" };
  }

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
 * One-shot outbound: GitHub (opt-in + private only) then GrokBot webhook (primary).
 * Webhook payload may include screenshot URL (private Convex storage URL) for triage.
 * Does not reschedule itself. Idempotent via claim + prior-success skips.
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
    const claim = await ctx.runMutation(
      internal.bugReports.internalClaimOutboundDelivery,
      { reportId },
    );
    if (claim.alreadyDelivered) {
      return {
        github: { ok: true, skipped: true, reason: "already_delivered" },
        webhook: { ok: true, skipped: true, reason: "already_delivered" },
      };
    }
    if (!claim.claimed) {
      // Another run holds the claim — do not double-post.
      return {
        github: {
          ok: claim.skipGithub,
          skipped: true,
          reason: "claim_held",
        },
        webhook: {
          ok: claim.skipWebhook,
          skipped: true,
          reason: "claim_held",
        },
      };
    }

    const report = await ctx.runQuery(internal.bugReports.internalGetBugReport, {
      reportId,
    });
    if (!report) {
      return {
        github: { ok: false, reason: "not_found" },
        webhook: { ok: false, reason: "not_found" },
      };
    }

    // Screenshot URL is for webhook / Convex triage only — never for public GitHub.
    let screenshotUrl: string | null = null;
    if (report.screenshotStorageId) {
      screenshotUrl = await ctx.runQuery(
        internal.bugReports.internalGetScreenshotUrl,
        { storageId: report.screenshotStorageId },
      );
    }

    const github = claim.skipGithub
      ? {
          ok: true,
          skipped: true,
          reason: "already_created",
          issueUrl: report.githubIssueUrl,
        }
      : await createGitHubIssue(ctx, reportId, report);

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

    const webhook = claim.skipWebhook
      ? { ok: true, skipped: true, reason: "already_delivered" }
      : await postGrokBotWebhook(
          ctx,
          reportId,
          webhookPayload,
          report.webhookDeliveredAt,
        );

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
