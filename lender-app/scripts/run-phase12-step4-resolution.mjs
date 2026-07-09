#!/usr/bin/env node
/**
 * Phase 12.2 Step 4 — run Class C resolution on production Convex.
 * Usage: node scripts/run-phase12-step4-resolution.mjs [--dry-run] [--merge]
 * Default: KEEP (operator choice)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const eballardAction = process.argv.includes("--merge") ? "MERGE" : "KEEP";

function loadSecret() {
  const raw = readFileSync(join(root, ".env.local"), "utf8");
  const m = raw.match(/^DATA_MIGRATION_ADMIN_SECRET=(.+)$/m);
  if (!m) throw new Error("DATA_MIGRATION_ADMIN_SECRET missing in .env.local");
  return m[1].trim();
}

const convexBin = join(root, "node_modules", "convex", "bin", "main.js");
const fn = "operator/resolveClassCStep4:resolveClassCStep4";
const payload = JSON.stringify({
  adminSecret: loadSecret(),
  eballardAction,
  dryRun,
});

console.log(dryRun ? "DRY RUN" : "LIVE", fn, "eballardAction=", eballardAction);
const result = spawnSync(process.execPath, [convexBin, "run", "--prod", fn, payload], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
});
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
const out = (result.stdout || "").trim();
const reportsDir = join(root, "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });
const outPath = join(
  reportsDir,
  dryRun ? "phase12-step4-dryrun.json" : "phase12-step4-result.json",
);
writeFileSync(outPath, out + "\n", "utf8");
console.log(out);
console.log(`Wrote ${outPath}`);
