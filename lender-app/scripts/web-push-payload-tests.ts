/**
 * Unit checks for lean Web Push allowlist + deep links (no Convex runtime).
 * Run: npx tsx scripts/web-push-payload-tests.ts
 */
import assert from "node:assert/strict";
import {
  buildWebPushPayload,
  isWebPushCategory,
  webPushDeepLink,
  WEB_PUSH_CATEGORIES,
} from "../convex/webPushPayload";

assert.equal(isWebPushCategory("document_activity"), true);
assert.equal(isWebPushCategory("task_assignment"), false);
assert.equal(isWebPushCategory("assignment_change"), false);
assert.equal(isWebPushCategory("deadline"), false);
assert.ok(WEB_PUSH_CATEGORIES.has("document_activity"));
assert.equal(WEB_PUSH_CATEGORIES.has("task_assignment"), false);

assert.equal(
  webPushDeepLink({ category: "task_assignment", taskId: "j57abc" }),
  "/tasks?task=j57abc",
);
assert.equal(
  webPushDeepLink({ category: "file_update", fileId: "file1" }),
  "/pipeline/file1",
);
assert.ok(
  webPushDeepLink({
    category: "document_activity",
    fileId: "file1",
    libraryDocumentId: "doc1",
  }).includes("tab=documents"),
);

const payload = buildWebPushPayload({
  _id: "n1",
  category: "document_activity",
  summary: "Bank statements — client submission pending review",
  detail: 'Client uploaded "statements.pdf" for Bank statements',
  fileId: "file1",
  libraryDocumentId: "doc1",
  documentVaultFileTaskId: "task1",
});
assert.ok(payload.url.includes("tab=documents"));
assert.equal(payload.tag, "user-notification:n1");
assert.ok(payload.title.includes("pending review"));

console.log("web-push-payload-tests: ok");
