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

assert.equal(isWebPushCategory("task_assignment"), true);
assert.equal(isWebPushCategory("assignment_change"), true);
assert.equal(isWebPushCategory("deadline"), false);
assert.ok(WEB_PUSH_CATEGORIES.has("task_assignment"));

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
  category: "task_assignment",
  summary: "Assigned to you: “Close docs”",
  detail: "Due tomorrow",
  taskId: "t1",
});
assert.equal(payload.url, "/tasks?task=t1");
assert.equal(payload.tag, "user-notification:n1");
assert.ok(payload.title.includes("Assigned"));

console.log("web-push-payload-tests: ok");
