#!/usr/bin/env node
/**
 * Phase 12.2 Step 2 — run Class B cleanup on production Convex.
 * Usage: node scripts/run-phase12-cleanup-step2.mjs [--dry-run]
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

function loadSecret() {
  const envPath = join(root, ".env.local");
  const raw = readFileSync(envPath, "utf8");
  const m = raw.match(/^DATA_MIGRATION_ADMIN_SECRET=(.+)$/m);
  if (!m) throw new Error("DATA_MIGRATION_ADMIN_SECRET missing in .env.local");
  return m[1].trim();
}

const secret = loadSecret();
const payload = JSON.stringify({ adminSecret: secret, dryRun });
const fn = "operator/cleanupClassBTenants:cleanupClassBTenants";

console.log(dryRun ? "DRY RUN" : "LIVE EXECUTE", fn);
const convexBin = join(root, "node_modules", "convex", "bin", "main.js");
const result = spawnSync(
  process.execPath,
  [convexBin, "run", "--prod", fn, payload],
  {
    cwd: root,
    encoding: "utf8",
  },
);
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "convex run failed");
  process.exit(result.status ?? 1);
}
const out = (result.stdout || "").trim();

const reportsDir = join(root, "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });
const outPath = join(
  reportsDir,
  dryRun ? "phase12-cleanup-step2-dryrun.json" : "phase12-cleanup-step2-result.json",
);
writeFileSync(outPath, out.trim() + "\n", "utf8");
console.log(out);
console.log(`Wrote ${outPath}`);
