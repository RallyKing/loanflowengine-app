import assert from "node:assert/strict";
import {
  buildLenderDeliveryEmailCopy,
  buildLenderDeliveryEmailItemsFromSelection,
} from "../lib/lenderDeliveryEmailCopy";

function run() {
  const text = buildLenderDeliveryEmailCopy(
    [
      {
        title: "Experience Track Record",
        description: "Prior deals, roles, and outcomes for the sponsor.",
      },
      { title: "Fully Executed Purchase Contract" },
      {
        title: "Detailed Budget with Scope of Work",
        description: "Line item costs and descriptions",
      },
    ],
    "https://paperworkprocessing.com/direct-lending-connection/abc123",
  );

  const expected = [
    "• Experience Track Record",
    "  Prior deals, roles, and outcomes for the sponsor.",
    "• Fully Executed Purchase Contract",
    "• Detailed Budget with Scope of Work",
    "  Line item costs and descriptions",
    "",
    "Please download all documents securely using this link below:",
    "",
    "https://paperworkprocessing.com/direct-lending-connection/abc123",
  ].join("\n");

  assert.equal(text, expected);

  const emptyish = buildLenderDeliveryEmailCopy(
    [{ title: "  " }, { title: "Tax Returns", description: "  " }],
    " https://example.com/lender/x ",
  );
  assert.ok(emptyish.startsWith("• Tax Returns\n\nPlease download"));
  assert.ok(emptyish.endsWith("https://example.com/lender/x"));
  assert.ok(!emptyish.includes("upload"));

  const fromSelection = buildLenderDeliveryEmailItemsFromSelection({
    selectedTaskIds: new Set(["t1"]),
    selectedFolderIds: new Set(["f1"]),
    selectedDocumentIds: new Set(["d1", "d2"]),
    fileTasks: [
      {
        _id: "t1",
        title: "Experience Track Record",
        description: "Sponsor history",
      },
      { _id: "t2", title: "Other", description: "ignored" },
    ],
    folders: [
      { _id: "f1", name: "Bank Statements", fileTaskId: "t1" },
      { _id: "f2", name: "Standalone folder" },
    ],
    documents: [
      { _id: "d1", title: "Track PDF", fileTaskId: "t1" },
      {
        _id: "d2",
        title: "Loose Appraisal",
        fileTaskId: "t2",
      },
    ],
  });

  assert.deepEqual(fromSelection, [
    {
      title: "Experience Track Record",
      description: "Sponsor history",
    },
    {
      title: "Loose Appraisal",
      description: "ignored",
    },
  ]);

  console.log("lender-delivery-email-copy-tests: ok");
}

run();
