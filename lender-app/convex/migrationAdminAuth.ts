/** Shared gate for operator-only migrations (matches `dataMigration` access). */
export function assertDataMigrationAdmin(secret: string) {
  const primary = process.env.DATA_MIGRATION_ADMIN_SECRET?.trim();
  const fallback = process.env.ORG_INTEGRITY_ADMIN_SECRET?.trim();
  const expected = primary || fallback;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized data migration operation.");
  }
}
