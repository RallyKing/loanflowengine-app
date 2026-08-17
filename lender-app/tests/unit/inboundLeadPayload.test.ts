import { describe, expect, it } from "vitest";
import {
  extractInboundLeadFields,
  mapInboundStageToStatusSlug,
  normalizeFieldKey,
  pickBusinessAndCompanyNames,
  resolveInboundEntityCompanyFields,
  sanitizeInboundScalarString,
  splitPersonName,
  stripStageNumericPrefix,
} from "../../lib/integrations/inboundLeadPayload";

describe("inboundLeadPayload", () => {
  it("strips GHL numeric stage prefixes", () => {
    expect(stripStageNumericPrefix("3 - Confirm Interest")).toBe(
      "Confirm Interest",
    );
    expect(stripStageNumericPrefix("4 - Portal / Docs Requested")).toBe(
      "Portal / Docs Requested",
    );
  });

  it("maps GHL stages onto DLC slugs", () => {
    expect(mapInboundStageToStatusSlug("3 - Confirm Interest")).toBe(
      "confirm_interest",
    );
    expect(mapInboundStageToStatusSlug("4 - Portal / Docs Requested")).toBe(
      "portal_collecting_docs",
    );
    expect(mapInboundStageToStatusSlug("confirm_interest")).toBe(
      "confirm_interest",
    );
    expect(mapInboundStageToStatusSlug("", "confirm_interest")).toBe(
      "confirm_interest",
    );
  });

  it("splits full names into first + last", () => {
    expect(splitPersonName("Joshua Test Ballard Test")).toEqual({
      firstName: "Joshua",
      lastName: "Test Ballard Test",
    });
    expect(splitPersonName("Madonna")).toEqual({
      firstName: "Madonna",
      lastName: "",
    });
  });

  it("normalizes spaced / underscored keys", () => {
    expect(normalizeFieldKey("business name")).toBe("businessname");
    expect(normalizeFieldKey("Business_Name")).toBe("businessname");
    expect(normalizeFieldKey("company name")).toBe("companyname");
  });

  it("sanitizes literal null / undefined / merge tags", () => {
    expect(sanitizeInboundScalarString("null")).toBeUndefined();
    expect(sanitizeInboundScalarString("NULL")).toBeUndefined();
    expect(sanitizeInboundScalarString("undefined")).toBeUndefined();
    expect(sanitizeInboundScalarString("  ")).toBeUndefined();
    expect(sanitizeInboundScalarString("{{contact.name}}")).toBeUndefined();
    expect(sanitizeInboundScalarString("Jireh Construction Cleaning")).toBe(
      "Jireh Construction Cleaning",
    );
  });

  it("extracts lead fields from webhook job payload wrapper", () => {
    const lead = extractInboundLeadFields({
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
    expect(lead).toEqual({
      externalId: "PkO86FfAa98GwxVMJHR5",
      name: "Joshua Test Ballard Test",
      firstName: "Joshua",
      lastName: "Test Ballard Test",
      email: "joshuaeballard@gmail.com",
      phone: "(949) 278-1365",
      stageRaw: "3 - Confirm Interest",
    });
  });

  it("reads nested contact first_name / last_name", () => {
    const lead = extractInboundLeadFields({
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
    expect(lead).toMatchObject({
      name: "Jane Doe",
      firstName: "Jane",
      lastName: "Doe",
      email: "a@b.com",
      phone: "555-0100",
    });
  });

  it("prefers explicit firstName/lastName over splitting name", () => {
    const lead = extractInboundLeadFields({
      body: {
        name: "Ignored Full",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
      },
    });
    expect(lead).toMatchObject({
      name: "Ignored Full",
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("returns null when name is missing", () => {
    expect(
      extractInboundLeadFields({ body: { email: "a@b.com" } }),
    ).toBeNull();
  });

  it("uses business name as firstName when first and last are missing", () => {
    const lead = extractInboundLeadFields({
      body: {
        id: "co-1",
        email: "ops@acme.com",
        companyName: "Acme Holdings LLC",
        firstName: "  ",
        lastName: "",
      },
    });
    expect(lead).toMatchObject({
      name: "Acme Holdings LLC",
      firstName: "Acme Holdings LLC",
      lastName: "",
      businessName: "Acme Holdings LLC",
      companyName: "Acme Holdings LLC",
      email: "ops@acme.com",
    });
  });

  it("maps company name into companyName + dba for entity details", () => {
    const lead = extractInboundLeadFields({
      body: {
        id: "ghl-co-1",
        name: "null",
        email: "ops@jireh.example",
        phone: "555-0100",
        stage: "3 - Confirm Interest",
        "company name": "Jireh Construction Cleaning",
      },
    });
    expect(lead).toMatchObject({
      businessName: "Jireh Construction Cleaning",
      companyName: "Jireh Construction Cleaning",
      firstName: "Jireh Construction Cleaning",
    });
    expect(resolveInboundEntityCompanyFields(lead!)).toEqual({
      legalName: "Jireh Construction Cleaning",
      companyName: "Jireh Construction Cleaning",
      dba: "Jireh Construction Cleaning",
    });
  });

  it("uses company as firstName when first name is missing (even with last)", () => {
    const lead = extractInboundLeadFields({
      body: {
        lastName: "Smith",
        "company name": "Riverline Retail",
        email: "s@example.com",
      },
    });
    expect(lead).toMatchObject({
      firstName: "Riverline Retail",
      lastName: "Smith",
      businessName: "Riverline Retail",
      companyName: "Riverline Retail",
    });
  });

  it("does not overwrite a real first name with company", () => {
    const lead = extractInboundLeadFields({
      body: {
        firstName: "Jane",
        companyName: "Acme Holdings LLC",
        email: "jane@acme.com",
      },
    });
    expect(lead).toMatchObject({
      name: "Jane",
      firstName: "Jane",
      lastName: "",
      businessName: "Acme Holdings LLC",
      companyName: "Acme Holdings LLC",
    });
  });

  it("accepts GHL space-keyed business name", () => {
    const lead = extractInboundLeadFields({
      body: {
        id: "ghl-1",
        email: "ops@nubi.com",
        phone: "555-0199",
        stage: "3 - Confirm Interest",
        "business name": "Nubi Capital LLC",
      },
    });
    expect(lead).toMatchObject({
      name: "Nubi Capital LLC",
      firstName: "Nubi Capital LLC",
      lastName: "",
      businessName: "Nubi Capital LLC",
      email: "ops@nubi.com",
    });
  });

  it("simulates duplicate JSON key last-wins for business name", () => {
    // JSON.parse keeps only the last duplicate key — replicate that shape.
    const body = JSON.parse(`{
      "email": "ops@acme.com",
      "business name": "{{business.name}}",
      "business name": "Acme From Company Field"
    }`) as Record<string, unknown>;
    expect(body["business name"]).toBe("Acme From Company Field");
    const lead = extractInboundLeadFields({ body });
    expect(lead).toMatchObject({
      firstName: "Acme From Company Field",
      businessName: "Acme From Company Field",
    });
  });

  it("prefers business name over company name when both present", () => {
    const picked = pickBusinessAndCompanyNames([
      {
        businessName: "Legal Biz LLC",
        companyName: "DBA Trade Co",
      },
    ]);
    expect(picked).toEqual({
      businessName: "Legal Biz LLC",
      companyName: "DBA Trade Co",
    });

    const lead = extractInboundLeadFields({
      body: {
        firstName: "Sam",
        lastName: "Lee",
        businessName: "Legal Biz LLC",
        companyName: "DBA Trade Co",
        email: "sam@example.com",
      },
    });
    expect(lead).toMatchObject({
      firstName: "Sam",
      lastName: "Lee",
      businessName: "Legal Biz LLC",
      companyName: "DBA Trade Co",
    });
    expect(resolveInboundEntityCompanyFields(lead!)).toEqual({
      legalName: "Legal Biz LLC",
      companyName: "DBA Trade Co",
      dba: "DBA Trade Co",
    });
  });

  it("accepts separate space-keyed business and company fields", () => {
    const lead = extractInboundLeadFields({
      body: {
        email: "a@b.com",
        "business name": "From Business Dot Name",
        "company name": "From Contact Company",
      },
    });
    expect(lead).toMatchObject({
      firstName: "From Business Dot Name",
      businessName: "From Business Dot Name",
      companyName: "From Contact Company",
    });
  });

  it("treats GHL literal null / unresolved merge tags as empty", () => {
    const lead = extractInboundLeadFields({
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
    expect(lead).toMatchObject({
      // Real company (contact.company_name) becomes legal/display company,
      // not left as literal null — unresolved business.name is ignored.
      businessName: "Jireh Construction Cleaning",
      companyName: "Jireh Construction Cleaning",
      firstName: "Jireh Construction Cleaning",
      lastName: "",
      name: "Jireh Construction Cleaning",
      email: "ops@jireh.example",
    });
    expect(lead?.firstName).not.toBe("null");
    expect(lead?.businessName).not.toBe("null");
    expect(resolveInboundEntityCompanyFields(lead!)).toEqual({
      legalName: "Jireh Construction Cleaning",
      companyName: "Jireh Construction Cleaning",
      dba: "Jireh Construction Cleaning",
    });
  });

  it("ignores unresolved {{merge}} tags left in the JSON body", () => {
    const lead = extractInboundLeadFields({
      body: {
        email: "ops@acme.com",
        name: "{{contact.name}}",
        "business name": "{{business.name}}",
        "company name": "Acme Roofing LLC",
      },
    });
    expect(lead).toMatchObject({
      businessName: "Acme Roofing LLC",
      companyName: "Acme Roofing LLC",
      firstName: "Acme Roofing LLC",
    });
  });
});
