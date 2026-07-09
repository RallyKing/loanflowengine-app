/**
 * Phase 8 collaboration foundations — pure logic tests (no Convex server).
 * Run: `tsx scripts/collaboration-phase8-tests.ts`
 */
import assert from "node:assert/strict";
import { compareAssignmentRoles, isPrivilegedAssignmentRole } from "../lib/workflows/assignmentRules";
import { collaborationCategoryForEvent } from "../lib/notifications/router";
import { partitionForClient, redactLenderForPortal } from "../lib/security/clientVisibility";
import { COLLABORATION_EVENT_TYPES } from "../lib/activity/eventTypes";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`ok — ${name}`);
  } catch (e) {
    console.error(`FAIL — ${name}`);
    throw e;
  }
}

test("assignmentRules: owner ranks above assignee", () => {
  assert.ok(compareAssignmentRoles("owner", "assignee") > 0);
});

test("assignmentRules: approver is privileged", () => {
  assert.equal(isPrivilegedAssignmentRole("approver"), true);
  assert.equal(isPrivilegedAssignmentRole("watcher"), false);
});

test("router: category mapping stable", () => {
  assert.equal(collaborationCategoryForEvent("assignment"), "assignment_change");
  assert.equal(collaborationCategoryForEvent("comment"), "comment_activity");
});

test("clientVisibility: strips internal-only keys", () => {
  const out = partitionForClient(
    { borrowerName: "A", bankAccountNumber: "123", note: "x" },
    { grantApproved: true },
  );
  assert.ok(!("bankAccountNumber" in out));
  assert.equal(out.borrowerName, "A");
});

test("clientVisibility: approval gate", () => {
  const gated = partitionForClient(
    { brokerSplitPct: 1.5 },
    { grantApproved: false },
  );
  assert.ok(!("brokerSplitPct" in gated));
});

test("clientVisibility: lender redaction", () => {
  const r = redactLenderForPortal(
    { company: "Acme", email: "a@b.com", phone: "555" } as const,
    "hide_contacts",
  );
  assert.equal(r.company, "Acme");
  assert.ok(!("email" in r));
});

test("eventTypes: unique event type strings", () => {
  const set = new Set(COLLABORATION_EVENT_TYPES);
  assert.equal(set.size, COLLABORATION_EVENT_TYPES.length);
});

console.log(`\ncollaboration-phase8-tests: ${passed} passed`);
