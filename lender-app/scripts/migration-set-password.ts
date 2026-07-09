/**
 * Set an internal auth user's password using DATA_MIGRATION_ADMIN_SECRET (or ORG_INTEGRITY_ADMIN_SECRET).
 *
 * Usage (from lender-app/):
 *   $env:DATA_MIGRATION_ADMIN_SECRET="…"
 *   npx tsx scripts/migration-set-password.ts "joshua@directlendingconnection.com" "new-password"
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../lib/security/argon2";
import { validatePlaintextPasswordPolicy } from "../lib/auth/passwordPolicy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.join(__dirname, "..");

function tryLoadEnvLocal() {
  try {
    const raw = fs.readFileSync(path.join(cwd, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim().replace(/^export\s+/i, "");
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* no .env.local */
  }
}

const [, , username, plainPassword] = process.argv;

async function main() {
  tryLoadEnvLocal();
  const adminSecret =
    process.env.DATA_MIGRATION_ADMIN_SECRET?.trim() ||
    process.env.ORG_INTEGRITY_ADMIN_SECRET?.trim() ||
    "";
  if (!username || !plainPassword) {
    console.error(
      "Usage: npx tsx scripts/migration-set-password.ts <username> <new-password>",
    );
    process.exit(1);
  }
  if (!adminSecret) {
    console.error(
      "Set DATA_MIGRATION_ADMIN_SECRET or ORG_INTEGRITY_ADMIN_SECRET in the environment.",
    );
    process.exit(1);
  }

  const policyErr = validatePlaintextPasswordPolicy(plainPassword);
  if (policyErr) {
    console.error(policyErr);
    process.exit(1);
  }

  const passwordHash = await hashPassword(plainPassword);
  const payload = JSON.stringify({
    adminSecret,
    username,
    passwordHash,
  });

  const r = spawnSync(
    "npx",
    ["convex", "run", "auth/migrationSetPassword:setAuthUserPassword", payload],
    { cwd, stdio: "inherit", shell: true },
  );
  process.exit(typeof r.status === "number" ? r.status : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
