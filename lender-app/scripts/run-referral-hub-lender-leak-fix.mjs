#!/usr/bin/env node
/**
 * Phase 25.6 — audit + fix referral hub lender leak on production Convex.
 * Usage:
 *   node scripts/run-referral-hub-lender-leak-fix.mjs audit
 *   node scripts/run-referral-hub-lender-leak-fix.mjs fix [--dry-run]
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const mode = process.argv[2] ?? "audit";
const dryRun = process.argv.includes("--dry-run");

function loadEnvFile(name) {
  const p = join(root, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(".env.convex.prod");
loadEnvFile(".env.local");

const secretPath = join(root, ".migration-admin.secret");
const adminSecret =
  process.env.DATA_MIGRATION_ADMIN_SECRET?.trim() ||
  (existsSync(secretPath) ? readFileSync(secretPath, "utf8").trim() : "");

if (!adminSecret) {
  console.error("Missing DATA_MIGRATION_ADMIN_SECRET or .migration-admin.secret");
  process.exit(1);
}

const bin = join(root, "node_modules", "convex", "bin", "main.js");
const fn =
  mode === "fix"
    ? "migrations/referralHubLenderLeakFix:fixReferralHubLenderLeak"
    : "migrations/referralHubLenderLeakFix:auditReferralHubLenderLeak";
const args = JSON.stringify(
  mode === "fix" ? { adminSecret, dryRun } : { adminSecret },
);
const result = spawnSync(process.execPath, [bin, "run", fn, args], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);

const text = (result.stdout || "").trim();
const start = Math.max(text.lastIndexOf("{"), text.lastIndexOf("["));
if (start >= 0) {
  try {
    console.log(JSON.stringify(JSON.parse(text.slice(start)), null, 2));
  } catch {
    /* raw output already printed */
  }
}
