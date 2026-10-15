import assert from "node:assert/strict";
import {
  buildClientLinkEmailCopy,
  clientLinkEmailItemFromFileTask,
  flattenRichTextForEmail,
  mergeClientLinkListIntoInviteBody,
} from "../lib/clientLinkEmailCopy";
import {
  buildClientTemplateDownloadUrl,
  parseCompanySlugPortalTemplatePath,
} from "../lib/clientPortalUrl";

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

  const templateUrl = buildClientTemplateDownloadUrl(
    "direct-lending-connection",
    "e61eb7fb4ec3a4522f9f80de2184ddc3473ab915ac0e10d8",
    "kg27storageidtemplate01",
  );
  assert.equal(
    templateUrl,
    "https://paperworkprocessing.com/direct-lending-connection/e61eb7fb4ec3a4522f9f80de2184ddc3473ab915ac0e10d8/template/kg27storageidtemplate01",
  );
  assert.deepEqual(
    parseCompanySlugPortalTemplatePath(
      "/direct-lending-connection/e61eb7fb4ec3a4522f9f80de2184ddc3473ab915ac0e10d8/template/kg27storageidtemplate01",
    ),
    {
      companySlug: "direct-lending-connection",
      token: "e61eb7fb4ec3a4522f9f80de2184ddc3473ab915ac0e10d8",
      storageId: "kg27storageidtemplate01",
    },
  );

  const withTemplateDownload = buildClientLinkEmailCopy(
    [
      clientLinkEmailItemFromFileTask({
        title: "Track Record",
        clientTemplateAttachments: [{ length: 1 } as never],
        templateDownloads: [
          {
            fileName: "Track Record Template.xlsx",
            url: templateUrl,
          },
        ],
      }),
    ],
    "https://paperworkprocessing.com/direct-lending-connection/e61eb7fb4ec3a4522f9f80de2184ddc3473ab915ac0e10d8",
  );
  assert.equal(
    withTemplateDownload,
    [
      "• Track Record (see attached template)",
      `  Download template: ${templateUrl}`,
      "",
      "Please upload the documents securely using the link below:",
      "",
      "https://paperworkprocessing.com/direct-lending-connection/e61eb7fb4ec3a4522f9f80de2184ddc3473ab915ac0e10d8",
    ].join("\n"),
  );

  const multiTemplate = buildClientLinkEmailCopy(
    [
      {
        title: "Track Record (see attached template)",
        templateDownloads: [
          { fileName: "A.xlsx", url: "https://example.com/a" },
          { fileName: "B.xlsx", url: "https://example.com/b" },
        ],
      },
    ],
    "https://portal.example/x",
  );
  assert.ok(multiTemplate.includes("Download template (A.xlsx): https://example.com/a"));
  assert.ok(multiTemplate.includes("Download template (B.xlsx): https://example.com/b"));

  const inviteMerged = mergeClientLinkListIntoInviteBody(
    "Hi {{Client_Name}},\n\nOpen:\n{{Upload_Link}}\n",
    withTemplateDownload,
  );
  assert.ok(inviteMerged.includes("Download template:"));
  assert.ok(inviteMerged.includes("{{Upload_Link}}"));
  assert.ok(inviteMerged.indexOf("Download template:") < inviteMerged.indexOf("{{Upload_Link}}"));

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
