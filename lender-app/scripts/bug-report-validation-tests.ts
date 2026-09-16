/**
 * Unit checks for bug report validation helpers (no Convex runtime).
 * Run: npx tsx scripts/bug-report-validation-tests.ts
 */
import assert from "node:assert/strict";
import {
  BUG_REPORT_MAX_SCREENSHOT_BYTES,
  buildBugReportGitHubIssueBody,
  buildBugReportGitHubTitle,
  isBugReportGitHubIssuesEnabled,
  normalizeBugReportSeverity,
  parsePipelineFileIdFromPath,
  validateBugReportDescription,
  validateBugReportScreenshotSize,
} from "../lib/bugReportValidation";

assert.equal(validateBugReportDescription("short"), "Describe the issue (at least 8 characters).");
assert.equal(validateBugReportDescription("  enough text here  "), null);
assert.ok(validateBugReportDescription("x".repeat(9000)));

assert.equal(normalizeBugReportSeverity(undefined), "medium");
assert.equal(normalizeBugReportSeverity("med"), "medium");
assert.equal(normalizeBugReportSeverity("HIGH"), "high");
assert.equal(normalizeBugReportSeverity("nope"), "medium");

assert.equal(validateBugReportScreenshotSize(0), "Screenshot is empty.");
assert.equal(validateBugReportScreenshotSize(1024), null);
assert.ok(validateBugReportScreenshotSize(BUG_REPORT_MAX_SCREENSHOT_BYTES + 1));

assert.equal(
  buildBugReportGitHubTitle("Something broke in the vault tab"),
  "[LFE Bug] Something broke in the vault tab",
);
assert.equal(
  buildBugReportGitHubTitle("a".repeat(100)).length,
  "[LFE Bug] ".length + 80,
);

assert.equal(parsePipelineFileIdFromPath("/pipeline"), null);
assert.equal(parsePipelineFileIdFromPath("/pipeline/library"), null);
assert.equal(parsePipelineFileIdFromPath("/pipeline/j57abc123"), "j57abc123");
assert.equal(
  parsePipelineFileIdFromPath("/pipeline/j57abc123/documents"),
  "j57abc123",
);
assert.equal(parsePipelineFileIdFromPath("/tasks"), null);

assert.equal(isBugReportGitHubIssuesEnabled(undefined), false);
assert.equal(isBugReportGitHubIssuesEnabled(""), false);
assert.equal(isBugReportGitHubIssuesEnabled("false"), false);
assert.equal(isBugReportGitHubIssuesEnabled("true"), true);
assert.equal(isBugReportGitHubIssuesEnabled("TRUE"), true);

const ghBody = buildBugReportGitHubIssueBody({
  description: "Vault tab crashes on apply",
  pagePath: "/pipeline/j57secretfile/documents",
  viewportWidth: 390,
  viewportHeight: 844,
  severity: "high",
  createdAt: Date.parse("2026-09-16T00:00:00.000Z"),
  reportId: "report123",
});
assert.ok(ghBody.includes("Vault tab crashes on apply"));
assert.ok(ghBody.includes("`/pipeline/j57secretfile/documents`"));
assert.equal(/https?:\/\//i.test(ghBody), false);
assert.equal(ghBody.includes("convex.cloud"), false);
assert.equal(ghBody.toLowerCase().includes("pipeline file id"), false);
assert.equal(ghBody.toLowerCase().includes("reporter"), false);
assert.equal(ghBody.includes("@"), false);
assert.ok(ghBody.includes("private Convex storage"));

console.log("bug-report-validation-tests: ok");
