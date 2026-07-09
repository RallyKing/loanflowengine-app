/**
 * Phase 25.11b — operator unlock on production Convex (no password reset).
 *
 * Usage:
 *   node scripts/unlock-production-auth-account.mjs joshua@directlendingconnection.com
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const LOGIN = (process.argv[2] ?? "joshua@directlendingconnection.com").trim();

function loadEnvFile(name) {
  const p = join(root, name);
  if (!existsSync(p)) return {};
  const out = {};
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
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function loadAdminSecret() {
  const local = loadEnvFile(".env.local");
  const prod = loadEnvFile(".env.convex.prod");
  const fileRel =
    local.DATA_MIGRATION_ADMIN_SECRET_FILE ??
    prod.DATA_MIGRATION_ADMIN_SECRET_FILE;
  if (fileRel) {
    const abs = join(root, fileRel);
    if (existsSync(abs)) {
      const line = readFileSync(abs, "utf8").split(/\r?\n/)[0]?.trim();
      if (line) return line;
    }
  }
  return (
    prod.DATA_MIGRATION_ADMIN_SECRET?.trim() ||
    prod.ORG_INTEGRITY_ADMIN_SECRET?.trim() ||
    local.DATA_MIGRATION_ADMIN_SECRET?.trim() ||
    local.ORG_INTEGRITY_ADMIN_SECRET?.trim() ||
    ""
  );
}

function loadConvexUrl() {
  const prod = loadEnvFile(".env.convex.prod");
  const local = loadEnvFile(".env.local");
  return (
    process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
    prod.NEXT_PUBLIC_CONVEX_URL?.trim() ||
    "https://basic-anaconda-984.convex.cloud"
  );
}

async function main() {
  const adminSecret = loadAdminSecret();
  if (!adminSecret) {
    console.error("Missing DATA_MIGRATION_ADMIN_SECRET (see .env.convex.prod)");
    process.exit(1);
  }
  const convexUrl = loadConvexUrl();
  const client = new ConvexHttpClient(convexUrl);

  const result = await client.mutation(
    "auth/operatorDiagnose:clearAccountLockoutByLogin",
    { adminSecret, loginOrEmail: LOGIN },
  );

  console.log(JSON.stringify({ convexUrl, result }, null, 2));

  if (!result?.ok) {
    console.error(`Unlock failed for ${LOGIN}:`, result?.code ?? "unknown");
    process.exit(1);
  }

  console.log(
    `\nAccount ${LOGIN} has been successfully unlocked on production.\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
