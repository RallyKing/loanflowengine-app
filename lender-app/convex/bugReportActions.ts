"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { buildBugReportGitHubTitle } from "../lib/bugReportValidation";

const GITHUB_REPO = "RallyKing/loanflowengine-app";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/issues`;

function resolveGitHubToken(): string | null {
  const primary = process.env.GITHUB_BUG_REPORT_TOKEN?.trim() ?? "";
  if (primary) return primary;
  // Optional reuse of a generic repo token if already configured on Convex.
  const fallback = process.env.GITHUB_TOKEN?.trim() ?? "";
  return fallback || null;
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

/**
 * One-shot GitHub issue create after `bugReports` insert.
 * Skips quietly when `GITHUB_BUG_REPORT_TOKEN` (or `GITHUB_TOKEN`) is unset.
 * Does not reschedule itself.
 */
export const createGitHubIssueForBugReport = internalAction({
  args: { reportId: v.id("bugReports") },
  returns: v.object({
    ok: v.boolean(),
    skipped: v.optional(v.boolean()),
    reason: v.optional(v.string()),
    issueUrl: v.optional(v.string()),
  }),
  handler: async (ctx, { reportId }) => {
    const token = resolveGitHubToken();
    if (!token) {
      console.warn(
        "bugReport: GITHUB_BUG_REPORT_TOKEN (or GITHUB_TOKEN) not set on Convex; skipping GitHub issue. Report remains in Convex bugReports.",
      );
      await ctx.runMutation(internal.bugReports.internalPatchGitHubIssue, {
        reportId,
        githubIssueError: "missing_token",
      });
      return {
        ok: false as const,
        skipped: true,
        reason: "missing_token",
      };
    }

    const report = await ctx.runQuery(internal.bugReports.internalGetBugReport, {
      reportId,
    });
    if (!report) {
      return { ok: false as const, reason: "not_found" };
    }

    let screenshotUrl: string | null = null;
    if (report.screenshotStorageId) {
      screenshotUrl = await ctx.runQuery(
        internal.bugReports.internalGetScreenshotUrl,
        { storageId: report.screenshotStorageId },
      );
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
        }),
      });

      const text = await res.text();
      if (!res.ok) {
        const errSnippet = text.slice(0, 400);
        console.error("bugReport: GitHub issue create failed", res.status, errSnippet);
        await ctx.runMutation(internal.bugReports.internalPatchGitHubIssue, {
          reportId,
          githubIssueError: `http_${res.status}:${errSnippet.slice(0, 200)}`,
        });
        return {
          ok: false as const,
          reason: `http_${res.status}`,
        };
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

      return {
        ok: true as const,
        issueUrl,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      console.error("bugReport: GitHub issue create threw", message);
      await ctx.runMutation(internal.bugReports.internalPatchGitHubIssue, {
        reportId,
        githubIssueError: message.slice(0, 240),
      });
      return { ok: false as const, reason: message };
    }
  },
});
