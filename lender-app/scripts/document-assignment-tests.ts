import assert from "node:assert/strict";
import {
  categoryOptionValue,
  documentCategoryNameConflict,
  findExistingRegistryAssignment,
  normalizeDocumentCategoryName,
  parseCategoryOptionValue,
} from "../lib/library/documentCategoryCatalog";

let passed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`ok — ${name}`);
  } catch (error) {
    console.error(`FAIL — ${name}`);
    throw error;
  }
}

test("normalizes category names for case-insensitive uniqueness", () => {
  assert.deepEqual(normalizeDocumentCategoryName("  Bank   Statements  "), {
    displayName: "Bank Statements",
    normalizedName: "bank statements",
  });
});

test("rejects blank custom category names", () => {
  assert.throws(
    () => normalizeDocumentCategoryName("   "),
    /Category name is required/,
  );
});

test("detects case-insensitive conflicts with built-in and custom categories", () => {
  assert.equal(
    documentCategoryNameConflict(" government id ", []),
    "Government ID",
  );
  assert.equal(
    documentCategoryNameConflict("BANK STATEMENTS", ["Bank Statements"]),
    "Bank Statements",
  );
  assert.equal(documentCategoryNameConflict("Rent Roll", []), null);
});

test("round-trips built-in and custom category selector values", () => {
  assert.deepEqual(parseCategoryOptionValue(categoryOptionValue("builtin", "id")), {
    kind: "builtin",
    value: "id",
  });
  assert.deepEqual(
    parseCategoryOptionValue(categoryOptionValue("custom", "category-123")),
    { kind: "custom", value: "category-123" },
  );
});

test("finds an existing contact assignment without matching entities", () => {
  const links = [
    { contactId: "contact-1" },
    { clientId: "entity-1" },
  ];
  assert.deepEqual(
    findExistingRegistryAssignment(links, "contact", "contact-1"),
    links[0],
  );
  assert.equal(
    findExistingRegistryAssignment(links, "entity", "contact-1"),
    undefined,
  );
});

test("finds an existing entity assignment idempotently", () => {
  const existing = { clientId: "entity-1" };
  assert.equal(
    findExistingRegistryAssignment([existing], "entity", "entity-1"),
    existing,
  );
});

console.log(`\n${passed} document assignment tests passed.`);
