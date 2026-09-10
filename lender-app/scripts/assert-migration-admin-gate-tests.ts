/**
 * P0-01 / Prompt 01: assert public migration/rebuild mutations reject
 * unauthenticated calls via assertDataMigrationAdmin, and remain wired to it.
 *
 * Run: `npx tsx scripts/assert-migration-admin-gate-tests.ts`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertDataMigrationAdmin } from "../convex/migrationAdminAuth";

const UNAUTH_MSG = "Unauthorized data migration operation.";

function expectUnauthorized(fn: () => void) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.message, UNAUTH_MSG);
    return true;
  });
}

function testAssertRejectsUnauthenticated() {
  const prevPrimary = process.env.DATA_MIGRATION_ADMIN_SECRET;
  const prevFallback = process.env.ORG_INTEGRITY_ADMIN_SECRET;
  try {
    delete process.env.DATA_MIGRATION_ADMIN_SECRET;
    delete process.env.ORG_INTEGRITY_ADMIN_SECRET;
    expectUnauthorized(() => assertDataMigrationAdmin(""));
    expectUnauthorized(() => assertDataMigrationAdmin("wrong-secret"));

    process.env.DATA_MIGRATION_ADMIN_SECRET = "expected-secret";
    expectUnauthorized(() => assertDataMigrationAdmin(""));
    expectUnauthorized(() => assertDataMigrationAdmin("wrong-secret"));
    assert.doesNotThrow(() => assertDataMigrationAdmin("expected-secret"));

    delete process.env.DATA_MIGRATION_ADMIN_SECRET;
    process.env.ORG_INTEGRITY_ADMIN_SECRET = "fallback-secret";
    expectUnauthorized(() => assertDataMigrationAdmin("expected-secret"));
    assert.doesNotThrow(() => assertDataMigrationAdmin("fallback-secret"));
  } finally {
    if (prevPrimary === undefined) delete process.env.DATA_MIGRATION_ADMIN_SECRET;
    else process.env.DATA_MIGRATION_ADMIN_SECRET = prevPrimary;
    if (prevFallback === undefined) delete process.env.ORG_INTEGRITY_ADMIN_SECRET;
    else process.env.ORG_INTEGRITY_ADMIN_SECRET = prevFallback;
  }
}

const GATED_EXPORTS: Array<{ file: string; exportName: string }> = [
  {
    file: "convex/contactMigration.ts",
    exportName: "migratePipelineContactsToStandalone",
  },
  {
    file: "convex/lenderContactMigration.ts",
    exportName: "migrateLenderContacts",
  },
  { file: "convex/legacyAssignToOwner.ts", exportName: "run" },
  {
    file: "convex/globalSearchSync.ts",
    exportName: "rebuildPipelineGlobalSearchPage",
  },
  {
    file: "convex/globalSearchSync.ts",
    exportName: "rebuildContactGlobalSearchPage",
  },
  {
    file: "convex/globalSearchSync.ts",
    exportName: "rebuildTaskGlobalSearchPage",
  },
];

function testPublicMutationsWireAdminGate() {
  const root = join(__dirname, "..");
  for (const { file, exportName } of GATED_EXPORTS) {
    const src = readFileSync(join(root, file), "utf8");
    const exportIdx = src.indexOf(`export const ${exportName}`);
    assert.ok(
      exportIdx >= 0,
      `${file}: missing export const ${exportName}`,
    );
    const nextExport = src.indexOf("\nexport const ", exportIdx + 1);
    const chunk =
      nextExport >= 0 ? src.slice(exportIdx, nextExport) : src.slice(exportIdx);
    assert.match(
      chunk,
      /adminSecret:\s*v\.string\(\)/,
      `${file}:${exportName} must require adminSecret`,
    );
    assert.match(
      chunk,
      /assertDataMigrationAdmin\(\s*adminSecret\s*\)/,
      `${file}:${exportName} must call assertDataMigrationAdmin(adminSecret)`,
    );
  }
}

function main() {
  testAssertRejectsUnauthenticated();
  testPublicMutationsWireAdminGate();
  console.log("assert-migration-admin-gate-tests: ok");
}

main();
