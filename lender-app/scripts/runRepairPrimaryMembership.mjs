/**
 * One-shot: run `organizationResolver.repairPrimaryMembership` on prod.
 * Reads `DATA_MIGRATION_ADMIN_SECRET` or `ORG_INTEGRITY_ADMIN_SECRET` from `.env.local`.
 * Usage: node scripts/runRepairPrimaryMembership.mjs [loginOrEmail]
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");
const loginOrEmail =
  process.argv[2]?.trim() || "joshua@directlendingconnection.com";

function parseEnvLocal(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = parseEnvLocal(envPath);
const secret =
  env.DATA_MIGRATION_ADMIN_SECRET?.trim() ||
  env.ORG_INTEGRITY_ADMIN_SECRET?.trim();
if (!secret) {
  console.error(
    "Missing DATA_MIGRATION_ADMIN_SECRET or ORG_INTEGRITY_ADMIN_SECRET in .env.local",
  );
  process.exit(1);
}

const payload = JSON.stringify({ adminSecret: secret, loginOrEmail });
const argFile = resolve(root, "_repairPrimaryMembership.args.json");
writeFileSync(argFile, payload, "utf8");

const invoke = resolve(root, "scripts", "invokeConvexRun.cjs");
const r = spawnSync(process.execPath, [
  invoke,
  argFile,
  "organizationResolver:repairPrimaryMembership",
  "--prod",
], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});
try {
  unlinkSync(argFile);
} catch {
  /* ignore */
}process.exit(r.status ?? 1);
