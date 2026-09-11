/**
 * Unit checks for inbound GHL → pipeline lead name resolution.
 * Run: npx tsx scripts/inbound-lead-payload-tests.ts
 *      npm run test:inbound-lead-payload
 */
import assert from "node:assert/strict";
import {
  extractInboundLeadFields,
  mapInboundStageToStatusSlug,
  normalizeFieldKey,
  pickBusinessAndCompanyNames,
  resolveInboundEntityCompanyFields,
  sanitizeInboundScalarString,
  splitPersonName,
  stripStageNumericPrefix,
} from "../lib/integrations/inboundLeadPayload";

function main() {
  assert.equal(
    stripStageNumericPrefix("3 - Confirm Interest"),
    "Confirm Interest",
  );
  assert.equal(
    stripStageNumericPrefix("4 - Portal / Docs Requested"),
    "Portal / Docs Requested",
  );

  assert.equal(
    mapInboundStageToStatusSlug("3 - Confirm Interest"),
    "confirm_interest",
  );
  assert.equal(
    mapInboundStageToStatusSlug("4 - Portal / Docs Requested"),
    "portal_collecting_docs",
  );
  assert.equal(
    mapInboundStageToStatusSlug("confirm_interest"),
    "confirm_interest",
  );
  assert.equal(
    mapInboundStageToStatusSlug("", "confirm_interest"),
    "confirm_interest",
  );

  assert.deepEqual(splitPersonName("Joshua Test Ballard Test"), {
    firstName: "Joshua",
    lastName: "Test Ballard Test",
  });
  assert.deepEqual(splitPersonName("Madonna"), {
    firstName: "Madonna",
    lastName: "",
  });

  assert.equal(normalizeFieldKey("business name"), "businessname");
  assert.equal(normalizeFieldKey("Business_Name"), "businessname");
  assert.equal(normalizeFieldKey("company name"), "companyname");

  assert.equal(sanitizeInboundScalarString("null"), undefined);
  assert.equal(sanitizeInboundScalarString("NULL"), undefined);
  assert.equal(sanitizeInboundScalarString("undefined"), undefined);
  assert.equal(sanitizeInboundScalarString("  "), undefined);
  assert.equal(sanitizeInboundScalarString("{{contact.name}}"), undefined);
  assert.equal(
    sanitizeInboundScalarString("Jireh Construction Cleaning"),
    "Jireh Construction Cleaning",
  );

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

  const fromNameOnly = extractInboundLeadFields({
    receivedAt: 1,
    rawLength: 10,
    body: {
      id: "PkO86FfAa98GwxVMJHR5",
      name: "Joshua Test Ballard Test",
      email: "joshuaeballard@gmail.com",
      phone: "(949) 278-1365",
      stage: "3 - Confirm Interest",
    },
  });
  assert.ok(fromNameOnly);
  assert.equal(fromNameOnly.externalId, "PkO86FfAa98GwxVMJHR5");
  assert.equal(fromNameOnly.name, "Joshua Test Ballard Test");
  assert.equal(fromNameOnly.firstName, "Joshua");
  assert.equal(fromNameOnly.lastName, "Test Ballard Test");
  assert.equal(fromNameOnly.email, "joshuaeballard@gmail.com");
  assert.equal(fromNameOnly.phone, "(949) 278-1365");
  assert.equal(fromNameOnly.stageRaw, "3 - Confirm Interest");

  const nestedContact = extractInboundLeadFields({
    body: {
      id: "ext-1",
      email: "a@b.com",
      contact: {
        first_name: "Jane",
        last_name: "Doe",
        phone: "555-0100",
      },
      stage: "confirm_interest",
    },
  });
  assert.ok(nestedContact);
  assert.equal(nestedContact.name, "Jane Doe");
  assert.equal(nestedContact.firstName, "Jane");
  assert.equal(nestedContact.lastName, "Doe");
  assert.equal(nestedContact.email, "a@b.com");
  assert.equal(nestedContact.phone, "555-0100");

  const preferExplicit = extractInboundLeadFields({
    body: {
      name: "Ignored Full",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    },
  });
  assert.ok(preferExplicit);
  assert.equal(preferExplicit.name, "Ignored Full");
  assert.equal(preferExplicit.firstName, "Ada");
  assert.equal(preferExplicit.lastName, "Lovelace");

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
  assert.equal(companyOnly.companyName, "Acme Holdings LLC");

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

  const spaceCompanyLast = extractInboundLeadFields({
    body: {
      lastName: "Smith",
      "company name": "Riverline Retail",
      email: "s@example.com",
    },
  });
  assert.ok(spaceCompanyLast);
  assert.equal(spaceCompanyLast.firstName, "Riverline Retail");
  assert.equal(spaceCompanyLast.lastName, "Smith");
  assert.equal(spaceCompanyLast.businessName, "Riverline Retail");
  assert.equal(spaceCompanyLast.companyName, "Riverline Retail");

  const missingAll = extractInboundLeadFields({
    body: { email: "nobody@example.com", phone: "555-0199" },
  });
  assert.equal(missingAll, null, "no name and no business must stay an error");

  assert.equal(
    extractInboundLeadFields({ body: { email: "a@b.com" } }),
    null,
  );

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

  const ghlSpaceBusiness = extractInboundLeadFields({
    body: {
      id: "ghl-1",
      email: "ops@nubi.com",
      phone: "555-0199",
      stage: "3 - Confirm Interest",
      "business name": "Nubi Capital LLC",
    },
  });
  assert.ok(ghlSpaceBusiness);
  assert.equal(ghlSpaceBusiness.name, "Nubi Capital LLC");
  assert.equal(ghlSpaceBusiness.firstName, "Nubi Capital LLC");
  assert.equal(ghlSpaceBusiness.lastName, "");
  assert.equal(ghlSpaceBusiness.businessName, "Nubi Capital LLC");

  const companyNameEntity = extractInboundLeadFields({
    body: {
      id: "ghl-co-1",
      name: "null",
      email: "ops@jireh.example",
      phone: "555-0100",
      stage: "3 - Confirm Interest",
      "company name": "Jireh Construction Cleaning",
    },
  });
  assert.ok(companyNameEntity);
  assert.equal(companyNameEntity.businessName, "Jireh Construction Cleaning");
  assert.equal(companyNameEntity.companyName, "Jireh Construction Cleaning");
  assert.equal(companyNameEntity.firstName, "Jireh Construction Cleaning");
  assert.deepEqual(resolveInboundEntityCompanyFields(companyNameEntity), {
    legalName: "Jireh Construction Cleaning",
    companyName: "Jireh Construction Cleaning",
    dba: "Jireh Construction Cleaning",
  });

  const dupLastWins = extractInboundLeadFields({
    body: JSON.parse(`{
      "email": "dup@example.com",
      "business name": "First Dead",
      "business name": "Last Wins Co"
    }`),
  });
  assert.ok(dupLastWins);
  assert.equal(dupLastWins.businessName, "Last Wins Co");
  assert.equal(dupLastWins.firstName, "Last Wins Co");

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

  const picked = pickBusinessAndCompanyNames([
    {
      businessName: "Legal Biz LLC",
      companyName: "DBA Trade Co",
    },
  ]);
  assert.deepEqual(picked, {
    businessName: "Legal Biz LLC",
    companyName: "DBA Trade Co",
  });

  const bothLegalDba = extractInboundLeadFields({
    body: {
      firstName: "Sam",
      lastName: "Lee",
      businessName: "Legal Biz LLC",
      companyName: "DBA Trade Co",
      email: "sam@example.com",
    },
  });
  assert.ok(bothLegalDba);
  assert.equal(bothLegalDba.firstName, "Sam");
  assert.equal(bothLegalDba.lastName, "Lee");
  assert.equal(bothLegalDba.businessName, "Legal Biz LLC");
  assert.equal(bothLegalDba.companyName, "DBA Trade Co");
  assert.deepEqual(resolveInboundEntityCompanyFields(bothLegalDba), {
    legalName: "Legal Biz LLC",
    companyName: "DBA Trade Co",
    dba: "DBA Trade Co",
  });

  const separateSpaceKeys = extractInboundLeadFields({
    body: {
      email: "a@b.com",
      "business name": "From Business Dot Name",
      "company name": "From Contact Company",
    },
  });
  assert.ok(separateSpaceKeys);
  assert.equal(separateSpaceKeys.firstName, "From Business Dot Name");
  assert.equal(separateSpaceKeys.businessName, "From Business Dot Name");
  assert.equal(separateSpaceKeys.companyName, "From Contact Company");

  const ghlNullMerge = extractInboundLeadFields({
    body: {
      id: "ghl-null-1",
      name: "null",
      email: "ops@jireh.example",
      phone: "555-0100",
      stage: "3 - Confirm Interest",
      "business name": "null",
      "company name": "Jireh Construction Cleaning",
    },
  });
  assert.ok(ghlNullMerge);
  assert.equal(ghlNullMerge.businessName, "Jireh Construction Cleaning");
  assert.equal(ghlNullMerge.companyName, "Jireh Construction Cleaning");
  assert.equal(ghlNullMerge.firstName, "Jireh Construction Cleaning");
  assert.equal(ghlNullMerge.lastName, "");
  assert.equal(ghlNullMerge.name, "Jireh Construction Cleaning");
  assert.notEqual(ghlNullMerge.firstName, "null");
  assert.notEqual(ghlNullMerge.businessName, "null");
  assert.deepEqual(resolveInboundEntityCompanyFields(ghlNullMerge), {
    legalName: "Jireh Construction Cleaning",
    companyName: "Jireh Construction Cleaning",
    dba: "Jireh Construction Cleaning",
  });

  const mergeTags = extractInboundLeadFields({
    body: {
      email: "ops@acme.com",
      name: "{{contact.name}}",
      "business name": "{{business.name}}",
      "company name": "Acme Roofing LLC",
    },
  });
  assert.ok(mergeTags);
  assert.equal(mergeTags.businessName, "Acme Roofing LLC");
  assert.equal(mergeTags.companyName, "Acme Roofing LLC");
  assert.equal(mergeTags.firstName, "Acme Roofing LLC");

  console.log("inbound-lead-payload-tests: ok");
}

main();
