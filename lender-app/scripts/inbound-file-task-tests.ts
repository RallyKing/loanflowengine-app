/**
 * Unit checks for file-linked inbound NEW LEAD tasks + create_file_task parsing.
 * Run: npx tsx scripts/inbound-file-task-tests.ts
 */
import assert from "node:assert/strict";
import {
  CONFIRM_INTEREST_BFS_TRIAGE_LABEL_ID,
  CREATE_FILE_TASK_ACTION,
  formatNewLeadMakeContactTitle,
  parseCreateFileTaskPayload,
  titleStartsWithNewLeadMakeContact,
} from "../lib/inboundFileTask";
import { sanitizeOrganizationIntegrationRules } from "../lib/orgIntegrationWorkflowsModel";
import { DEFAULT_VIEWER_TIMEZONE } from "../lib/dateTimeZone";

function main() {
  assert.equal(DEFAULT_VIEWER_TIMEZONE, "America/Chicago");
  assert.equal(
    CONFIRM_INTEREST_BFS_TRIAGE_LABEL_ID,
    "jx7jmdznxsw4pqp13y096vfb4x87n1y6",
  );

  // 2026-08-22 15:00 CDT = 2026-08-22 20:00 UTC
  const chicagoAfternoon = Date.UTC(2026, 7, 22, 20, 0, 0);
  assert.equal(
    formatNewLeadMakeContactTitle(chicagoAfternoon),
    "NEW LEAD: Make Contact 8/22/2026",
  );

  // Late evening UTC still same Chicago calendar date
  const chicagoAlmostMidnight = Date.UTC(2026, 7, 23, 4, 30, 0); // 11:30pm CDT Aug 22
  assert.equal(
    formatNewLeadMakeContactTitle(chicagoAlmostMidnight),
    "NEW LEAD: Make Contact 8/22/2026",
  );

  // After Chicago midnight → next calendar day (not UTC date)
  const afterChicagoMidnight = Date.UTC(2026, 7, 23, 5, 30, 0); // 12:30am CDT Aug 23
  assert.equal(
    formatNewLeadMakeContactTitle(afterChicagoMidnight),
    "NEW LEAD: Make Contact 8/23/2026",
  );

  assert.equal(
    titleStartsWithNewLeadMakeContact("NEW LEAD: Make Contact 8/22/2026"),
    true,
  );
  assert.equal(
    titleStartsWithNewLeadMakeContact("NEW LEAD: Make Contact"),
    true,
  );
  assert.equal(
    titleStartsWithNewLeadMakeContact("Follow up"),
    false,
  );

  const webhook = parseCreateFileTaskPayload({
    receivedAt: 1,
    body: {
      action: CREATE_FILE_TASK_ACTION,
      relatedFileId: "k17file",
      title: "NEW LEAD: Make Contact 8/22/2026",
      description: "optional",
      triageLabelId: CONFIRM_INTEREST_BFS_TRIAGE_LABEL_ID,
      category: "call",
      status: "todo",
    },
  });
  assert.ok(webhook);
  assert.equal(webhook.relatedFileId, "k17file");
  assert.equal(webhook.category, "call");
  assert.equal(webhook.status, "todo");

  assert.equal(
    parseCreateFileTaskPayload({
      body: { title: "x", relatedFileId: "abc" },
    }),
    null,
    "webhook parser requires action create_file_task",
  );

  const orgTaskStillOk = sanitizeOrganizationIntegrationRules([
    {
      id: "org-task-1",
      enabled: true,
      action: { type: "create_org_task", title: "Inbox ping", body: "hi" },
    },
    {
      id: "file-task-1",
      enabled: true,
      action: {
        type: "create_file_task",
        relatedFileId: "k17file",
        title: "NEW LEAD: Make Contact 8/22/2026",
        triageLabelId: CONFIRM_INTEREST_BFS_TRIAGE_LABEL_ID,
        category: "call",
        status: "todo",
      },
    },
  ]);
  assert.equal(orgTaskStillOk.length, 2);
  assert.equal(orgTaskStillOk[0]?.action.type, "create_org_task");
  assert.equal(orgTaskStillOk[1]?.action.type, "create_file_task");

  const rejectedCategory = sanitizeOrganizationIntegrationRules([
    {
      id: "bad",
      enabled: true,
      action: {
        type: "create_file_task",
        relatedFileId: "k17file",
        title: "x",
        category: "admin",
      },
    },
  ]);
  assert.equal(rejectedCategory.length, 0);

  console.log("inbound-file-task-tests: ok");
}

main();
