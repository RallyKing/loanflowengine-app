#!/usr/bin/env node
/**
 * Phase 25.7b — migrate contacts.contactRoleId → contactRoleIds[].
 * Usage: node scripts/run-contact-multi-role-migration.mjs [--dry-run]
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
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
const args = JSON.stringify({ adminSecret, dryRun });
const result = spawnSync(
  process.execPath,
  [bin, "run", "migrations/contactMultiRoleMigration:migrateContactMultiRole", args],
  { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);
