import assert from "node:assert/strict";
import { buildClientLinkEmailCopy } from "../lib/clientLinkEmailCopy";

function run() {
  const text = buildClientLinkEmailCopy(
    [
      "Experience Track Record (see attached template)",
      "Fully Executed Purchase Contract",
      "Detailed Budget with Scope of Work (line item costs and descriptions)",
    ],
    "https://paperworkprocessing.com/direct-lending-connection/e61eb7fb4ec3a4522f9f80de2184ddc3473ab915ac0e10d8",
  );

  const expected = [
    "• Experience Track Record (see attached template)",
    "• Fully Executed Purchase Contract",
    "• Detailed Budget with Scope of Work (line item costs and descriptions)",
    "",
    "Please upload the documents securely using the link below:",
    "",
    "https://paperworkprocessing.com/direct-lending-connection/e61eb7fb4ec3a4522f9f80de2184ddc3473ab915ac0e10d8",
  ].join("\n");

  assert.equal(text, expected);

  const emptyish = buildClientLinkEmailCopy(
    ["  ", "Tax Returns"],
    " https://example.com/a/b ",
  );
  assert.ok(emptyish.startsWith("• Tax Returns\n\nPlease upload"));
  assert.ok(emptyish.endsWith("https://example.com/a/b"));

  console.log("client-link-email-copy-tests: ok");
}

run();
