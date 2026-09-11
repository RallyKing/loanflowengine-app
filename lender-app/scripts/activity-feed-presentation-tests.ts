/**
 * Activity feed presentation (human labels, JSON detail scrubbing, dedupe).
 * Run: `npx tsx scripts/activity-feed-presentation-tests.ts`
 */
import assert from "node:assert/strict";

import {
  activityFeedContactHref,
  activityFeedLenderHref,
  activityFeedTaskHref,
  dedupeActivityFeedRows,
  formatCollaborationDelta,
  formatFeedDetail,
  humanizeFeedKind,
  sanitizeFeedSummary,
  type ActivityFeedPresentable,
} from "../lib/activity/feedPresentation";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test("humanizeFeedKind maps collaboration + file kinds", () => {
  assert.equal(humanizeFeedKind("collaboration.status_changed"), "Status changed");
  assert.equal(humanizeFeedKind("file.vault_broker_review"), "Broker review");
  assert.equal(humanizeFeedKind("file.deal_patch"), "Deal updated");
  assert.equal(humanizeFeedKind("weird_custom_event"), "Weird Custom Event");
});

test("formatFeedDetail hides raw JSON IDs and formats status deltas", () => {
  const raw = JSON.stringify({
    previousStatus: "In Review",
    nextStatus: "Approved",
    previousStageId: "k17abcdefghijklmnopqrstuv",
    nextStageId: "k17zzzzzzzzzzzzzzzzzzzzzz",
  });
  assert.equal(formatFeedDetail(raw), "In Review → Approved");
  assert.equal(formatFeedDetail('{"previousStageId":"k17abcdefghijklmnopqrstuv"}'), null);
  assert.equal(formatFeedDetail("lender notes look fine"), "lender notes look fine");
  assert.equal(
    formatFeedDetail("portal_collecting_docs → initial_review"),
    "Portal Collecting Docs → Initial Review",
  );
  assert.equal(formatFeedDetail("approved,"), "Approved");
});

test("formatCollaborationDelta prefers approval labels", () => {
  assert.equal(
    formatCollaborationDelta({ approval: "Approved with conditions" }),
    "Approved with conditions",
  );
  assert.equal(
    formatCollaborationDelta({
      previousStatus: "Submitted",
      nextStatus: "Approved",
    }),
    "Submitted → Approved",
  );
  assert.equal(
    formatCollaborationDelta({
      previousStatus: "portal_collecting_docs",
      nextStatus: "initial_review",
    }),
    "Portal Collecting Docs → Initial Review",
  );
});

test("sanitizeFeedSummary strips internal ids", () => {
  const id = "k17abcdefghijklmnopqrstuv";
  assert.equal(
    sanitizeFeedSummary(`Review completed ${id} on file`),
    "Review completed on file",
  );
  assert.equal(
    sanitizeFeedSummary("Deal: overviewTabLayout"),
    "Deal: Overview Tab Layout",
  );
});

test("dedupeActivityFeedRows collapses dual-writer approval events", () => {
  const now = 1_700_000_000_000;
  const rows: ActivityFeedPresentable[] = [
    {
      _id: "a",
      at: now,
      category: "file",
      kind: "collaboration.status_changed",
      summary: "Broker approved package",
      detail: JSON.stringify({ approval: "Approved" }),
      actorKey: "user@example.com",
      fileId: "file1",
    },
    {
      _id: "b",
      at: now + 1200,
      category: "file",
      kind: "file.vault_broker_review",
      summary: "Broker approved package",
      detail: "Approved",
      actorKey: "user@example.com",
      fileId: "file1",
    },
    {
      _id: "c",
      at: now + 60_000,
      category: "file",
      kind: "collaboration.status_changed",
      summary: "Stage changed on “Acme”",
      actorKey: "user@example.com",
      fileId: "file1",
    },
  ];
  const out = dedupeActivityFeedRows(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0]!._id, "c");
  // Prefer non-JSON detail variant
  assert.equal(out[1]!._id, "b");
});

test("deep links align with registryCommandCenterHref patterns", () => {
  assert.equal(activityFeedContactHref("cid123"), "/contacts/cid123");
  assert.equal(
    activityFeedLenderHref("lid456"),
    "/lenders?lender=lid456",
  );
  assert.equal(activityFeedTaskHref("tid789"), "/tasks?task=tid789");
});

console.log(`\n${passed} tests passed`);
