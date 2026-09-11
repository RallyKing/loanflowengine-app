import assert from "node:assert/strict";
import {
  fileTaskTitleForClientLinkEmail,
  taskTypeAllowsClientTemplates,
} from "../lib/fileTaskClientTemplates";

/**
 * Mirrors convex/clientTemplateAttachments.copyClientTemplateAttachments
 * (plain TS — no Convex runtime in unit scripts).
 */
function copyClientTemplateAttachments(
  attachments:
    | Array<{
        storageId: string;
        fileName: string;
        mimeType: string;
        size: number;
      }>
    | undefined,
) {
  if (!attachments?.length) return undefined;
  return attachments.map((a) => ({
    storageId: a.storageId,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
  }));
}

function run() {
  assert.equal(taskTypeAllowsClientTemplates("document_upload"), true);
  assert.equal(taskTypeAllowsClientTemplates("client_instruction"), true);
  assert.equal(taskTypeAllowsClientTemplates(undefined), true);
  assert.equal(taskTypeAllowsClientTemplates("internal_task"), false);
  assert.equal(taskTypeAllowsClientTemplates("block_assignment"), false);

  assert.equal(
    fileTaskTitleForClientLinkEmail("Bank statements", false),
    "Bank statements",
  );
  assert.equal(
    fileTaskTitleForClientLinkEmail("Experience Track Record", true),
    "Experience Track Record (see attached template)",
  );
  assert.equal(
    fileTaskTitleForClientLinkEmail(
      "Experience Track Record (see attached template)",
      true,
    ),
    "Experience Track Record (see attached template)",
  );

  assert.equal(copyClientTemplateAttachments(undefined), undefined);
  assert.equal(copyClientTemplateAttachments([]), undefined);
  const copied = copyClientTemplateAttachments([
    {
      storageId: "kg123",
      fileName: "PFS blank.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 12000,
    },
  ]);
  assert.ok(copied);
  assert.equal(copied!.length, 1);
  assert.equal(copied![0]!.fileName, "PFS blank.xlsx");
  assert.equal(copied![0]!.storageId, "kg123");

  console.log("file-task-client-template-tests: ok");
}

run();
