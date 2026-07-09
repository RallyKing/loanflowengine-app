/**
 * Run `migrations/migrateLegacyNotes` on production (reads `.env.convex.prod`).
 * Usage:
 *   node scripts/run-migrate-legacy-notes-prod.mjs          # dry run
 *   node scripts/run-migrate-legacy-notes-prod.mjs --execute  # live migrate
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function parseEnvFile(relPath) {
  const out = {};
  const raw = fs.readFileSync(path.join(root, relPath), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

const prod = parseEnvFile(".env.convex.prod");
const dryRun = !process.argv.includes("--execute");
const args = JSON.stringify({
  adminSecret: prod.DATA_MIGRATION_ADMIN_SECRET,
  dryRun,
});

const convexBin = path.join(root, "node_modules", "convex", "bin", "main.js");
const env = {
  ...process.env,
  CONVEX_DEPLOYMENT: prod.CONVEX_DEPLOYMENT,
  CONVEX_DEPLOY_KEY: prod.CONVEX_DEPLOY_KEY,
};

console.log(dryRun ? "Dry run (no writes)…" : "Executing migration…");

const out = execFileSync(
  process.execPath,
  [convexBin, "run", "migrations/migrateLegacyNotes:migrateLegacyNotes", args, "--prod"],
  { encoding: "utf8", env, cwd: root },
);

console.log(out.trim());
