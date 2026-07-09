import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.convex.prod");
const envText = fs.readFileSync(envPath, "utf8");
const secret = envText.match(/DATA_MIGRATION_ADMIN_SECRET=(\S+)/)?.[1]?.trim();
if (!secret) {
  console.error("Missing DATA_MIGRATION_ADMIN_SECRET in .env.convex.prod");
  process.exit(1);
}

const dryRun = !process.argv.includes("--execute");
/** Target `organizations._id` — override with env when you have multiple tenants. */
const organizationId =
  process.env.ORG_SCOPE_BACKFILL_ORGANIZATION_ID?.trim() ||
  "mx76bxqnc23q76cb99tvrffmy58644pf";
const fnArgs = JSON.stringify({
  adminSecret: secret,
  organizationId,
  dryRun,
});

const convexCli = path.join(root, "node_modules", "convex", "bin", "main.js");
const envFile = path.join(root, ".env.convex.prod");
const r = spawnSync(
  process.execPath,
  [
    convexCli,
    "run",
    "--env-file",
    envFile,
    "--typecheck",
    "disable",
    "migrations/backfillLegacyOrgScope:ensurePrimaryOrgMembershipAndBackfill",
    fnArgs,
  ],
  {
    cwd: root,
    stdio: "inherit",
    shell: false,
  },
);

if (r.error) {
  console.error(r.error);
}
if (dryRun) {
  console.error("\nDry run. Re-run: node scripts/run-org-backfill-prod.mjs --execute\n");
}
process.exit(r.status ?? 1);
