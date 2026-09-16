/**
 * Unit proofs for client-side hub triage projection (schedule/snooze/overdue).
 * Run: `npx tsx scripts/project-hub-triage-highlight-tests.ts`
 */
import assert from "node:assert/strict";
import {
  labelCandidateActiveAt,
  projectHubTriageHighlightMap,
  type HubTriageFileCandidate,
} from "../lib/pipeline/projectHubTriageHighlightMap";

const NOW = 1_700_000_000_000;

function baseLabel(overrides: Partial<HubTriageFileCandidate["labels"][number]> = {}) {
  return {
    triageLabelId: "label_1",
    label: "Hot",
    colorToken: "red",
    severityWeight: 10,
    sourceTaskId: "task_1",
    sourceTaskTitle: "Call back",
    hexCode: "#ff0000",
    ...overrides,
  };
}

function baseFile(
  overrides: Partial<HubTriageFileCandidate> = {},
): HubTriageFileCandidate {
  return {
    fileId: "file_1",
    projectKey: "proj_1",
    clientKey: "client_1",
    labels: [baseLabel()],
    open: [{ status: "todo", dueDate: NOW - 60_000 }],
    ...overrides,
  };
}

function main(): void {
  assert.equal(labelCandidateActiveAt({}, NOW), true);
  assert.equal(
    labelCandidateActiveAt({ scheduledTriggerTime: NOW + 60_000 }, NOW),
    false,
  );
  assert.equal(
    labelCandidateActiveAt({ scheduledTriggerTime: NOW - 1 }, NOW),
    true,
  );
  assert.equal(
    labelCandidateActiveAt({ snoozedUntil: NOW + 60_000 }, NOW),
    false,
  );

  const active = projectHubTriageHighlightMap([baseFile()], NOW);
  assert.ok(active.files.file_1);
  assert.equal(active.counts.files.file_1?.overdue, 1);
  assert.ok(active.projects.proj_1);
  assert.ok(active.clients.client_1);

  const beforeSchedule = projectHubTriageHighlightMap(
    [
      baseFile({
        labels: [baseLabel({ scheduledTriggerTime: NOW + 60_000 })],
        open: [{ status: "todo", dueDate: NOW + 60_000 }],
      }),
    ],
    NOW,
  );
  assert.equal(beforeSchedule.files.file_1, undefined);
  assert.equal(beforeSchedule.counts.files.file_1?.overdue ?? 0, 0);
  assert.equal(beforeSchedule.counts.files.file_1?.open, 1);

  const afterSchedule = projectHubTriageHighlightMap(
    [
      baseFile({
        labels: [baseLabel({ scheduledTriggerTime: NOW - 1 })],
      }),
    ],
    NOW,
  );
  assert.ok(afterSchedule.files.file_1);

  const snoozed = projectHubTriageHighlightMap(
    [
      baseFile({
        labels: [baseLabel({ snoozedUntil: NOW + 60_000 })],
        open: [{ status: "in_progress", dueDate: NOW - 1, snoozedUntil: NOW + 60_000 }],
      }),
    ],
    NOW,
  );
  assert.equal(snoozed.files.file_1, undefined);
  assert.equal(snoozed.counts.files.file_1, undefined);

  const woken = projectHubTriageHighlightMap(
    [
      baseFile({
        labels: [baseLabel({ snoozedUntil: NOW - 1 })],
        open: [{ status: "todo", dueDate: NOW - 1, snoozedUntil: NOW - 1 }],
      }),
    ],
    NOW,
  );
  assert.ok(woken.files.file_1);
  assert.equal(woken.counts.files.file_1?.overdue, 1);

  console.log("[project-hub-triage-highlight-tests] OK");
}

main();
