/**
 * Unit checks for file workspace header primary-borrower subtitle.
 * Run: npx tsx scripts/file-header-primary-borrower-label-tests.ts
 */

import assert from "node:assert/strict";
import type { Doc, Id } from "../convex/_generated/dataModel";
import {
  FILE_HEADER_NO_PRIMARY_BORROWER,
  entityBorrowerLabelFromDealBusiness,
  resolveFileHeaderPrimaryBorrowerLabel,
} from "../modules/pipeline/lib/core/resolveFileHeaderPrimaryBorrowerLabel";

function link(
  partial: Partial<Doc<"contactFileLinks">> & {
    contactId: Id<"contacts">;
    role: string;
  },
): Doc<"contactFileLinks"> {
  return {
    _id: `link_${partial.contactId}` as Id<"contactFileLinks">,
    _creationTime: 1,
    fileId: "file1" as Id<"pipeline">,
    createdAt: partial.createdAt ?? 1,
    updatedAt: partial.updatedAt ?? 1,
    contactRoleId: partial.contactRoleId,
    registryRoleId: partial.registryRoleId,
    notes: partial.notes,
    ...partial,
  } as Doc<"contactFileLinks">;
}

function main() {
  assert.equal(
    entityBorrowerLabelFromDealBusiness({
      legalName: "  Acme Holdings LLC ",
      dba: "Acme",
    }),
    "Acme Holdings LLC",
  );
  assert.equal(
    entityBorrowerLabelFromDealBusiness({ dba: " Trade Name " }),
    "Trade Name",
  );

  const contactId = "c1" as Id<"contacts">;
  const contactsById = new Map([
    [
      contactId,
      {
        _id: contactId,
        name: "Jordan Lee",
        companyName: "Ignored Co",
      },
    ],
  ]);

  const primaryOnly = resolveFileHeaderPrimaryBorrowerLabel({
    links: [
      link({
        contactId,
        role: "client",
        registryRoleId: "primary_borrower",
        contactRoleId: "client",
      }),
    ],
    contactsById,
    entityDisplayName: "AZ Portfolio Investor",
    fallbackClientDisplayName: "Frozen Create Name",
  });
  assert.equal(primaryOnly.label, "AZ Portfolio Investor · Jordan Lee");
  assert.equal(primaryOnly.fromPrimaryBorrower, true);

  const individualOnly = resolveFileHeaderPrimaryBorrowerLabel({
    links: [
      link({
        contactId,
        role: "client",
        registryRoleId: "primary_borrower",
      }),
    ],
    contactsById,
    fallbackClientDisplayName: "Frozen Create Name",
  });
  assert.equal(individualOnly.label, "Jordan Lee");
  assert.equal(individualOnly.fromPrimaryBorrower, true);

  const dealFallback = resolveFileHeaderPrimaryBorrowerLabel({
    links: [],
    dealBorrowers: [{ firstName: "Pat", lastName: "Nguyen" }],
    entityDisplayName: "Nguyen Holdings",
    fallbackClientDisplayName: "Frozen",
  });
  assert.equal(dealFallback.label, "Nguyen Holdings · Pat Nguyen");

  const coBorrowerIgnored = resolveFileHeaderPrimaryBorrowerLabel({
    links: [
      link({
        contactId: "c2" as Id<"contacts">,
        role: "co-signer",
        registryRoleId: "coborrower",
      }),
    ],
    contactsById: new Map([
      [
        "c2" as Id<"contacts">,
        { _id: "c2" as Id<"contacts">, name: "Co Person", companyName: "" },
      ],
    ]),
    fallbackClientDisplayName: "Hierarchy Client",
  });
  assert.equal(coBorrowerIgnored.label, "Hierarchy Client");
  assert.equal(coBorrowerIgnored.fromPrimaryBorrower, false);

  const empty = resolveFileHeaderPrimaryBorrowerLabel({});
  assert.equal(empty.label, FILE_HEADER_NO_PRIMARY_BORROWER);

  console.log("file-header-primary-borrower-label-tests: ok");
}

main();
