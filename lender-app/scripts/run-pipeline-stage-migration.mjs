/**
 * Run Phase 12.1 pipeline stage migration against production Convex.
 *
 * Usage (from lender-app/):
 *   node scripts/run-pipeline-stage-migration.mjs           # dry run
 *   node scripts/run-pipeline-stage-migration.mjs --execute   # live + idempotency pass
 *   node scripts/run-pipeline-stage-migration.mjs --verify    # integrity for primary org
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadSecret() {
  for (const file of [".env.convex.prod", ".env.local"]) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const m =
      text.match(/DATA_MIGRATION_ADMIN_SECRET=(\S+)/)?.[1]?.trim() ??
      text.match(/ORG_INTEGRITY_ADMIN_SECRET=(\S+)/)?.[1]?.trim();
    if (m) return m;
  }
  return (
    process.env.DATA_MIGRATION_ADMIN_SECRET?.trim() ??
    process.env.ORG_INTEGRITY_ADMIN_SECRET?.trim()
  );
}

function loadOrgId() {
  for (const file of [".env.convex.prod", ".env.local"]) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const m = text.match(/ORG_SCOPE_BACKFILL_ORGANIZATION_ID=(\S+)/)?.[1]?.trim();
    if (m) return m;
  }
  return process.env.ORG_SCOPE_BACKFILL_ORGANIZATION_ID?.trim();
}

const secret = loadSecret();
if (!secret) {
  console.error("Missing DATA_MIGRATION_ADMIN_SECRET");
  process.exit(1);
}

const execute = process.argv.includes("--execute");
const verifyOnly = process.argv.includes("--verify");
const envFile = fs.existsSync(path.join(root, ".env.convex.prod"))
  ? path.join(root, ".env.convex.prod")
  : path.join(root, ".env.local");
const convexCli = path.join(root, "node_modules", "convex", "bin", "main.js");

function convexRun(fn, args) {
  const r = spawnSync(
    process.execPath,
    [
      convexCli,
      "run",
      "--env-file",
      envFile,
      "--typecheck",
      "disable",
      fn,
      JSON.stringify(args),
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) process.exit(r.status ?? 1);
  try {
    return JSON.parse(r.stdout.trim());
  } catch {
    return r.stdout;
  }
}

if (verifyOnly) {
  const orgId = loadOrgId();
  if (!orgId) {
    console.error("Set ORG_SCOPE_BACKFILL_ORGANIZATION_ID for verify");
    process.exit(1);
  }
  const out = convexRun(
    "migrations/migrateOrganizationPipelineStages:verifyOrganizationIntegrity",
    { adminSecret: secret, organizationId: orgId },
  );
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

const dryOut = convexRun(
  "migrations/migrateOrganizationPipelineStages:migrateAllOrganizations",
  { adminSecret: secret, dryRun: true },
);
console.log(JSON.stringify(dryOut, null, 2));

if (!execute) {
  console.error("\n[dry-run complete] Re-run with --execute for live migration.\n");
  process.exit(0);
}

const liveOut = convexRun(
  "migrations/migrateOrganizationPipelineStages:migrateAllOrganizations",
  { adminSecret: secret, dryRun: false, confirmIdempotency: true },
);
console.log(JSON.stringify(liveOut, null, 2));

const orgId = loadOrgId();
if (orgId) {
  const integrity = convexRun(
    "migrations/migrateOrganizationPipelineStages:verifyOrganizationIntegrity",
    { adminSecret: secret, organizationId: orgId },
  );
  console.log("\n--- verifyOrganizationIntegrity ---");
  console.log(JSON.stringify(integrity, null, 2));
}
