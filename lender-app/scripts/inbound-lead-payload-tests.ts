/**
 * Unit checks for inbound GHL → pipeline lead name resolution.
 * Run: npx tsx scripts/inbound-lead-payload-tests.ts
 */
import assert from "node:assert/strict";
import { extractInboundLeadFields } from "../lib/integrations/inboundLeadPayload";

function main() {
  const person = extractInboundLeadFields({
    receivedAt: 1,
    rawLength: 10,
    body: {
      id: "PkO86FfAa98GwxVMJHR5",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    },
  });
  assert.ok(person);
  assert.equal(person.firstName, "Jane");
  assert.equal(person.lastName, "Doe");
  assert.equal(person.name, "Jane Doe");

  const companyOnly = extractInboundLeadFields({
    body: {
      id: "co-1",
      email: "ops@acme.com",
      phone: "555-0100",
      companyName: "Acme Holdings LLC",
      firstName: "   ",
      lastName: "",
    },
  });
  assert.ok(companyOnly, "company-only contact must still extract a lead");
  assert.equal(companyOnly.firstName, "Acme Holdings LLC");
  assert.equal(companyOnly.lastName, "");
  assert.equal(companyOnly.name, "Acme Holdings LLC");
  assert.equal(companyOnly.businessName, "Acme Holdings LLC");

  const businessNameKey = extractInboundLeadFields({
    body: {
      email: "a@b.com",
      businessName: "Nubi LLC",
    },
  });
  assert.ok(businessNameKey);
  assert.equal(businessNameKey.firstName, "Nubi LLC");
  assert.equal(businessNameKey.lastName, "");

  const companyKey = extractInboundLeadFields({
    body: {
      contact: {
        company: "Riverline Retail",
        email: "c@d.com",
      },
    },
  });
  assert.ok(companyKey);
  assert.equal(companyKey.firstName, "Riverline Retail");
  assert.equal(companyKey.businessName, "Riverline Retail");

  const customField = extractInboundLeadFields({
    body: {
      email: "e@f.com",
      customFields: [
        { id: "xyz", name: "Business Name", value: "Custom Co" },
      ],
    },
  });
  assert.ok(customField);
  assert.equal(customField.firstName, "Custom Co");
  assert.equal(customField.businessName, "Custom Co");

  const customDataMap = extractInboundLeadFields({
    body: {
      email: "g@h.com",
      customData: { company_name: "Map Co LLC" },
    },
  });
  assert.ok(customDataMap);
  assert.equal(customDataMap.firstName, "Map Co LLC");

  const keepRealFirst = extractInboundLeadFields({
    body: {
      firstName: "Ada",
      companyName: "Acme Holdings LLC",
      email: "ada@example.com",
    },
  });
  assert.ok(keepRealFirst);
  assert.equal(keepRealFirst.firstName, "Ada");
  assert.equal(keepRealFirst.lastName, "");
  assert.equal(keepRealFirst.name, "Ada");
  assert.equal(keepRealFirst.businessName, "Acme Holdings LLC");

  const keepLastOnly = extractInboundLeadFields({
    body: {
      lastName: "Smith",
      companyName: "Should Fill First",
      email: "s@example.com",
    },
  });
  assert.ok(keepLastOnly);
  assert.equal(keepLastOnly.lastName, "Smith");
  // Missing first name → company fills firstName (GHL company-only contacts).
  assert.equal(keepLastOnly.firstName, "Should Fill First");

  const missingAll = extractInboundLeadFields({
    body: { email: "nobody@example.com", phone: "555-0199" },
  });
  assert.equal(missingAll, null, "no name and no business must stay an error");

  const whitespaceOnly = extractInboundLeadFields({
    body: {
      firstName: "  ",
      lastName: "\t",
      name: " ",
      companyName: "   ",
      email: "blank@example.com",
    },
  });
  assert.equal(whitespaceOnly, null, "whitespace-only names must not invent a file");

  const spaceKey = extractInboundLeadFields({
    body: {
      email: "space@example.com",
      "business name": "Spaced Biz LLC",
    },
  });
  assert.ok(spaceKey);
  assert.equal(spaceKey.firstName, "Spaced Biz LLC");
  assert.equal(spaceKey.businessName, "Spaced Biz LLC");

  const dupLastWins = extractInboundLeadFields({
    body: JSON.parse(`{
      "email": "dup@example.com",
      "business name": "First Dead",
      "business name": "Last Wins Co"
    }`),
  });
  assert.ok(dupLastWins);
  assert.equal(dupLastWins.businessName, "Last Wins Co");

  const both = extractInboundLeadFields({
    body: {
      firstName: "Pat",
      businessName: "Preferred Business",
      companyName: "Fallback Company",
      email: "pat@example.com",
    },
  });
  assert.ok(both);
  assert.equal(both.firstName, "Pat");
  assert.equal(both.businessName, "Preferred Business");
  assert.equal(both.companyName, "Fallback Company");

  console.log("inbound-lead-payload-tests: ok");
}

main();
