/**
 * Pure unit tests for Alerts scheduling helpers.
 * Run: npx tsx scripts/alerts-scheduling-tests.ts
 */

import assert from "node:assert/strict";
import {
  DEFAULT_ALERT_PREFERENCES,
  resolveAlertPreferences,
  shouldCreateInAppAlert,
  shouldSendPushAlert,
} from "../lib/alerts/alertCategories";
import { buildAlertDedupeKey } from "../lib/alerts/dedupe";
import {
  isFileSnoozeAlertStillValid,
  isHubTaskDueAlertStillValid,
  isVaultFileTaskDueAlertStillValid,
  parseSnoozedUntilMs,
  shouldScheduleOneShot,
} from "../lib/alerts/fireValidity";
import {
  assertInternalAppPath,
  fileSnoozeDeepLink,
  hubTaskDeepLink,
  isInternalAppPath,
} from "../lib/alerts/internalPath";

function testInternalPaths() {
  assert.equal(isInternalAppPath("/pipeline/abc"), true);
  assert.equal(isInternalAppPath("/tasks?task=xyz"), true);
  assert.equal(isInternalAppPath("//evil.com"), false);
  assert.equal(isInternalAppPath("https://evil.com"), false);
  assert.equal(isInternalAppPath("http://x"), false);
  assert.equal(isInternalAppPath("javascript:alert(1)"), false);
  assert.equal(isInternalAppPath("/%2f%2fevil.com"), false);
  assert.equal(isInternalAppPath("/tasks\\x"), false);
  assert.throws(() => assertInternalAppPath("https://x"));
  assert.equal(fileSnoozeDeepLink("fid"), "/pipeline/fid");
  assert.equal(hubTaskDeepLink("tid"), "/tasks?task=tid");
}

function testDedupe() {
  const a = buildAlertDedupeKey({
    userKey: "u1",
    category: "task_due",
    entityType: "task",
    entityId: "t1",
    fireAt: 1_700_000_000_000,
  });
  const b = buildAlertDedupeKey({
    userKey: "u1",
    category: "task_due",
    entityType: "task",
    entityId: "t1",
    fireAt: 1_700_000_000_000,
  });
  assert.equal(a, b);
  const c = buildAlertDedupeKey({
    userKey: "u1",
    category: "task_due",
    entityType: "task",
    entityId: "t1",
    fireAt: 1_700_000_000_001,
  });
  assert.notEqual(a, c);
}

function testPreferences() {
  const d = resolveAlertPreferences(null);
  assert.deepEqual(d, DEFAULT_ALERT_PREFERENCES);
  assert.equal(shouldCreateInAppAlert(d, "task_due"), true);
  assert.equal(shouldSendPushAlert(d, "task_due"), false);

  const off = resolveAlertPreferences({
    task_due: { inApp: false, push: true },
  });
  assert.equal(shouldCreateInAppAlert(off, "task_due"), false);
  assert.equal(shouldSendPushAlert(off, "task_due"), true);
  assert.equal(shouldCreateInAppAlert(off, "file_snooze_due"), true);
}

function testValidity() {
  const fireAt = Date.parse("2026-10-08T12:00:00.000Z");
  assert.equal(parseSnoozedUntilMs("2026-10-08T12:00:00.000Z"), fireAt);
  assert.equal(
    isFileSnoozeAlertStillValid({
      snoozedUntil: "2026-10-08T12:00:00.000Z",
      expectedFireAt: fireAt,
    }),
    true,
  );
  assert.equal(
    isFileSnoozeAlertStillValid({
      snoozedUntil: undefined,
      expectedFireAt: fireAt,
    }),
    false,
  );
  assert.equal(
    isHubTaskDueAlertStillValid({
      dueDate: fireAt,
      expectedFireAt: fireAt,
      status: "todo",
    }),
    true,
  );
  assert.equal(
    isHubTaskDueAlertStillValid({
      dueDate: fireAt,
      expectedFireAt: fireAt,
      status: "done",
    }),
    false,
  );
  assert.equal(
    isVaultFileTaskDueAlertStillValid({
      dueDate: fireAt,
      expectedFireAt: fireAt,
      status: "incomplete",
    }),
    true,
  );
  assert.equal(
    isVaultFileTaskDueAlertStillValid({
      dueDate: fireAt,
      expectedFireAt: fireAt,
      status: "complete",
    }),
    false,
  );

  const future = shouldScheduleOneShot({ fireAt: Date.now() + 60_000, now: Date.now() });
  assert.equal(future?.kind, "future");
  const past = shouldScheduleOneShot({ fireAt: Date.now() - 1000, now: Date.now() });
  assert.equal(past?.kind, "immediate_past");
  assert.equal(past?.delayMs, 0);
}

function main() {
  testInternalPaths();
  testDedupe();
  testPreferences();
  testValidity();
  console.log("alerts-scheduling-tests: OK");
}

main();
