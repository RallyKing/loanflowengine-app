/**
 * One-shot Phase 2 DC award-radar import.
 *
 * Usage (from lender-app/):
 *   npm run import:dc-award-radar
 *
 * Requires DATA_MIGRATION_ADMIN_SECRET (or ORG_INTEGRITY_ADMIN_SECRET) on the
 * Convex deployment and in local env. Idempotent on sourceKey — re-run updates
 * the same ~29 rows and does not create duplicates.
 *
 * Does not schedule work, poll, or push to GHL.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { loadOperatorSecret } from "./lib/operatorConvexIdentity.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE2_DC_AWARD_SIGNAL_COUNT } from "../lib/dcAwardRadar.js";

const APP_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function loadEnv() {
  const envPath = join(APP_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, k, raw] = m;
    const v = raw.replace(/^['"]|['"]$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    console.error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Point the CLI at the target Convex deployment first.",
    );
    process.exit(1);
  }

  const client = new ConvexHttpClient(url);
  const result = await client.mutation(api.dcAwardSignals.operatorImportPhase2, {
    operatorSecret: loadOperatorSecret(),
  });

  console.log(
    JSON.stringify(
      {
        ...result,
        expectedSeedRows: PHASE2_DC_AWARD_SIGNAL_COUNT,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
