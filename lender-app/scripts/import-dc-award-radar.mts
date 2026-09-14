/**
 * DC award-radar import (Phase 2 seed or nationwide Hermes payload).
 *
 * Usage (from lender-app/):
 *   npm run import:dc-award-radar
 *   npm run import:dc-award-radar -- ./data/dc-award-radar-nationwide.csv
 *   npm run import:dc-award-radar -- --contacts ./data/dc-award-radar-contacts.csv
 *   npm run import:dc-award-radar -- --backfill-campus
 *
 * Requires DATA_MIGRATION_ADMIN_SECRET (or ORG_INTEGRITY_ADMIN_SECRET) on the
 * Convex deployment and in local env. Idempotent on sourceKey — re-run updates
 * the same project rows and does not create duplicates. Contact-only mode never
 * inserts projects.
 *
 * Does not schedule work, poll, scrape, or push to GHL.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { loadOperatorSecret } from "./lib/operatorConvexIdentity.js";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE2_DC_AWARD_SIGNAL_COUNT } from "../lib/dcAwardRadar.js";
import {
  chunkOperatorRows,
  parseDcAwardRadarContactPayload,
  parseDcAwardRadarNationwidePayload,
} from "../lib/dcAwardRadarPayload.js";

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

function parseArgs(argv: string[]) {
  const contactsFlag = argv.includes("--contacts");
  const backfillCampus = argv.includes("--backfill-campus");
  const pathArg = argv.find((arg) => !arg.startsWith("-"));
  return {
    contactsOnly: contactsFlag,
    backfillCampus,
    filePath: pathArg ? resolve(process.cwd(), pathArg) : null,
  };
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

  const { contactsOnly, backfillCampus, filePath } = parseArgs(
    process.argv.slice(2),
  );
  const client = new ConvexHttpClient(url);
  const operatorSecret = loadOperatorSecret();

  if (backfillCampus) {
    if (contactsOnly || filePath) {
      console.error(
        "--backfill-campus cannot be combined with --contacts or a CSV path.",
      );
      process.exit(1);
    }
    const result = await client.mutation(
      api.dcAwardSignals.operatorBackfillCampusGroups,
      { operatorSecret },
    );
    console.log(
      JSON.stringify(
        {
          mode: "backfill-campus",
          ...result,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!filePath) {
    if (contactsOnly) {
      console.error("Contact refresh requires a CSV/JSON file path.");
      process.exit(1);
    }
    const result = await client.mutation(api.dcAwardSignals.operatorImportPhase2, {
      operatorSecret,
    });
    console.log(
      JSON.stringify(
        {
          mode: "phase2-seed",
          ...result,
          expectedSeedRows: PHASE2_DC_AWARD_SIGNAL_COUNT,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = readFileSync(filePath, "utf8");

  if (contactsOnly) {
    const parsed = parseDcAwardRadarContactPayload(raw);
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let total = 0;
    for (const chunk of chunkOperatorRows(parsed.rows)) {
      const result = await client.mutation(
        api.dcAwardSignals.operatorUpsertContacts,
        { operatorSecret, rows: chunk },
      );
      inserted += result.inserted;
      updated += result.updated;
      skipped += result.skipped;
      total += result.total;
    }
    console.log(
      JSON.stringify(
        {
          mode: "contacts",
          format: parsed.format,
          filePath,
          inserted,
          updated,
          skipped,
          total,
        },
        null,
        2,
      ),
    );
    return;
  }

  const parsed = parseDcAwardRadarNationwidePayload(raw);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let total = 0;
  for (const chunk of chunkOperatorRows(parsed.rows)) {
    const result = await client.mutation(api.dcAwardSignals.operatorUpsertRows, {
      operatorSecret,
      rows: chunk,
    });
    inserted += result.inserted;
    updated += result.updated;
    skipped += result.skipped;
    total += result.total;
  }
  console.log(
    JSON.stringify(
      {
        mode: "nationwide",
        format: parsed.format,
        filePath,
        inserted,
        updated,
        skipped,
        total,
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
