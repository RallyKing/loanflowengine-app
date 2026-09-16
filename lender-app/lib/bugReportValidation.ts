/**
 * Pure validation helpers for in-app bug reports (client + unit tests).
 */

export const BUG_REPORT_MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
export const BUG_REPORT_MAX_DESCRIPTION_CHARS = 8_000;
export const BUG_REPORT_MIN_DESCRIPTION_CHARS = 8;
export const BUG_REPORT_RATE_LIMIT_PER_HOUR = 10;
export const BUG_REPORT_GITHUB_TITLE_PREFIX = "[LFE Bug]";

/** Env flag: must be exactly `"true"` to attempt GitHub issue creation. */
export const BUG_REPORT_GITHUB_ISSUES_ENABLED_ENV =
  "BUG_REPORT_GITHUB_ISSUES_ENABLED";

/**
 * Whether GitHub issue creation is opted-in via env.
 * Default is off — Convex + GrokBot webhook are the primary intake path.
 */
export function isBugReportGitHubIssuesEnabled(
  envValue: string | undefined | null,
): boolean {
  return (envValue ?? "").trim().toLowerCase() === "true";
}

export type BugReportSeverity = "low" | "medium" | "high";

const SEVERITIES = new Set<BugReportSeverity>(["low", "medium", "high"]);

export function normalizeBugReportDescription(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

export function validateBugReportDescription(raw: string): string | null {
  const text = normalizeBugReportDescription(raw);
  if (text.length < BUG_REPORT_MIN_DESCRIPTION_CHARS) {
    return `Describe the issue (at least ${BUG_REPORT_MIN_DESCRIPTION_CHARS} characters).`;
  }
  if (text.length > BUG_REPORT_MAX_DESCRIPTION_CHARS) {
    return `Description is too long (max ${BUG_REPORT_MAX_DESCRIPTION_CHARS} characters).`;
  }
  return null;
}

export function normalizeBugReportSeverity(
  raw: string | undefined | null,
): BugReportSeverity {
  const s = (raw ?? "medium").trim().toLowerCase();
  if (s === "med") return "medium";
  if (SEVERITIES.has(s as BugReportSeverity)) {
    return s as BugReportSeverity;
  }
  return "medium";
}

export function validateBugReportScreenshotSize(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Screenshot is empty.";
  }
  if (bytes > BUG_REPORT_MAX_SCREENSHOT_BYTES) {
    return `Screenshot is too large (max ${Math.round(BUG_REPORT_MAX_SCREENSHOT_BYTES / (1024 * 1024))} MB).`;
  }
  return null;
}

/** GitHub issue title: `[LFE Bug] <first 80 chars of description>`. */
export function buildBugReportGitHubTitle(description: string): string {
  const clean = normalizeBugReportDescription(description).replace(/\s+/g, " ");
  const snippet = clean.slice(0, 80);
  return `${BUG_REPORT_GITHUB_TITLE_PREFIX} ${snippet}`.trim();
}

/**
 * Public-safe GitHub issue body: description + non-PII metadata only.
 * Never includes screenshot URLs, pipeline file ids, reporter email/user key,
 * or full page URLs (path only). Screenshots stay Convex-private / webhook-only.
 */
export function buildBugReportGitHubIssueBody(args: {
  description: string;
  pagePath: string;
  viewportWidth: number;
  viewportHeight: number;
  severity: string;
  createdAt: number;
  reportId: string;
}): string {
  const path = args.pagePath.trim().slice(0, 500) || "/";
  const lines: string[] = [
    "## Description",
    normalizeBugReportDescription(args.description),
    "",
    "## Metadata",
    `- **Severity:** ${args.severity}`,
    `- **Report id:** \`${args.reportId}\``,
    `- **Path:** \`${path.replace(/`/g, "'")}\``,
    `- **Viewport:** ${args.viewportWidth}×${args.viewportHeight}`,
    `- **Created at:** ${new Date(args.createdAt).toISOString()}`,
    "",
    "## Screenshot",
    "_Screenshot is retained in private Convex storage and delivered via the intake webhook only — not attached to this public tracker._",
    "",
    "---",
    "_Submitted via LFE in-app **Report a bug**. Primary triage: Convex `bugReports` + GrokBot webhook._",
  ];
  return lines.join("\n");
}

/**
 * Parse `/pipeline/[fileId]` Convex file id from a path (not hub/library/etc.).
 */
export function parsePipelineFileIdFromPath(
  pathname: string | null | undefined,
): string | null {
  if (!pathname?.startsWith("/pipeline/")) return null;
  const seg = pathname.slice("/pipeline/".length).split("/")[0] ?? "";
  if (!seg) return null;
  const blocked = new Set([
    "library",
    "licenses",
    "intake",
    "file",
    "client",
  ]);
  if (blocked.has(seg)) return null;
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

export function validateBugReportScreenshotFile(file: File): string | null {
  if (!file || file.size <= 0) return "Screenshot is empty.";
  const sizeErr = validateBugReportScreenshotSize(file.size);
  if (sizeErr) return sizeErr;
  const type = (file.type || "").toLowerCase();
  if (type && !type.startsWith("image/")) {
    return "Screenshot must be an image.";
  }
  return null;
}
