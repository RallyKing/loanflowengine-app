import assert from "node:assert/strict";
import {
  buildClientLinkEmailCopy,
  clientLinkEmailItemFromFileTask,
  flattenRichTextForEmail,
} from "../lib/clientLinkEmailCopy";

function run() {
  const titleOnly = buildClientLinkEmailCopy(
    [
      "Experience Track Record (see attached template)",
      "Fully Executed Purchase Contract",
      "Detailed Budget with Scope of Work (line item costs and descriptions)",
    ],
    "https://paperworkprocessing.com/direct-lending-connection/e61eb7fb4ec3a4522f9f80de2184ddc3473ab915ac0e10d8",
  );

  const expectedTitles = [
    "• Experience Track Record (see attached template)",
    "• Fully Executed Purchase Contract",
    "• Detailed Budget with Scope of Work (line item costs and descriptions)",
    "",
    "Please upload the documents securely using the link below:",
    "",
    "https://paperworkprocessing.com/direct-lending-connection/e61eb7fb4ec3a4522f9f80de2184ddc3473ab915ac0e10d8",
  ].join("\n");

  assert.equal(titleOnly, expectedTitles);

  const emptyish = buildClientLinkEmailCopy(
    ["  ", "Tax Returns"],
    " https://example.com/a/b ",
  );
  assert.ok(emptyish.startsWith("• Tax Returns\n\nPlease upload"));
  assert.ok(emptyish.endsWith("https://example.com/a/b"));

  assert.equal(
    flattenRichTextForEmail(
      '<p>Pay the appraisal fee</p><p>Use <a href="https://pay.example/appraise">this portal</a></p>',
    ),
    "Pay the appraisal fee\nUse this portal (https://pay.example/appraise)",
  );

  const instructionItem = clientLinkEmailItemFromFileTask({
    title: "Pay appraisal fee",
    description: "Client must pay before inspection.",
    clientInstructionText:
      "Please pay the $650 appraisal invoice.\nUse the portal below.",
    instructionUrl: "https://pay.example/appraise",
    clientTemplateAttachments: [],
  });

  const withInstruction = buildClientLinkEmailCopy(
    [instructionItem],
    "https://paperworkprocessing.com/portal/abc",
  );
  assert.equal(
    withInstruction,
    [
      "• Pay appraisal fee",
      "  Client must pay before inspection.",
      "  Please pay the $650 appraisal invoice.",
      "  Use the portal below.",
      "  https://pay.example/appraise",
      "",
      "Please upload the documents securely using the link below:",
      "",
      "https://paperworkprocessing.com/portal/abc",
    ].join("\n"),
  );

  const templated = clientLinkEmailItemFromFileTask({
    title: "Experience Track Record",
    clientTemplateAttachments: [{ length: 1 } as never],
  });
  assert.equal(templated.title, "Experience Track Record (see attached template)");

  const noDuplicateUrl = buildClientLinkEmailCopy(
    [
      {
        title: "Wire instructions",
        instructionText: "Send to https://bank.example/wire",
        instructionUrl: "https://bank.example/wire",
      },
    ],
    "https://portal.example/x",
  );
  assert.equal(
    noDuplicateUrl,
    [
      "• Wire instructions",
      "  Send to https://bank.example/wire",
      "",
      "Please upload the documents securely using the link below:",
      "",
      "https://portal.example/x",
    ].join("\n"),
  );

  console.log("client-link-email-copy-tests: ok");
}

run();
