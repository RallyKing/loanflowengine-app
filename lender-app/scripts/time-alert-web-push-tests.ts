/**
 * Unit tests for Time Alerts Web Push helpers + scheduled prefs inheritance shape.
 * Run: npx tsx scripts/time-alert-web-push-tests.ts
 */

import assert from "node:assert/strict";
import {
  buildTimeAlertWebPushPayload,
  isTimeAlertWebPushCategory,
} from "../convex/webPushPayload";
import {
  resolveAlertPreferences,
  shouldSendPushAlert,
} from "../lib/alerts/alertCategories";

function testPayload() {
  const p = buildTimeAlertWebPushPayload({
    _id: "alert123",
    category: "task_scheduled",
    title: "Scheduled: Get remaining list back from FundRock",
    body: undefined,
    deepLinkPath: "/tasks?task=k17abc",
  });
  assert.equal(p.url, "/tasks?task=k17abc");
  assert.equal(p.tag, "time-alert:alert123");
  assert.ok(p.title.startsWith("Scheduled:"));
}

function testCategoryAllowlist() {
  assert.equal(isTimeAlertWebPushCategory("task_scheduled"), true);
  assert.equal(isTimeAlertWebPushCategory("task_due"), true);
  assert.equal(isTimeAlertWebPushCategory("file_snooze_due"), true);
  assert.equal(isTimeAlertWebPushCategory("document_activity"), false);
}

function testScheduledInheritsTaskDuePush() {
  // Mirrors prefsFromDoc inheritance for legacy rows.
  const resolved = resolveAlertPreferences({
    task_due: { inApp: true, push: true },
    task_scheduled: { inApp: true, push: true }, // after inheritance
  });
  assert.equal(shouldSendPushAlert(resolved, "task_scheduled"), true);
  assert.equal(shouldSendPushAlert(resolved, "task_due"), true);
}

testPayload();
testCategoryAllowlist();
testScheduledInheritsTaskDuePush();
console.log("time-alert-web-push-tests: ok");
