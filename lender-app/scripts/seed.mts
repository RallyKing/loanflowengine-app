/**
 * Seed the Convex database with the existing Comprehensive_Lender_List.csv.
 *
 * Usage:
 *   1. Make sure `.env.local` exists (run `npx convex dev` once if not).
 *   2. Put the CSV at either:
 *        ../Comprehensive_Lender_List.csv      (workspace root)
 *        ./scripts/seed.csv                     (inside lender-app/scripts)
 *      The script checks both.
 *   3. Run:  npm run seed
 */
import { ConvexHttpClient } from "convex/browser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

// Dynamic import below avoids tsx's static-import interop issue with the
// Convex-generated `api.js` module (which has no "type": "module" marker).
const { api } = (await import("../convex/_generated/api.js")) as {
  api: { lenders: { bulkUpsert: unknown } };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");

// Same LENDER_FIELDS -> CSV header mapping as lib/schema.ts, duplicated here
// because this script runs in plain node without TS path aliases.
const FIELDS_TO_CSV: Array<[string, string]> = [
  ["source", "Source"],
  ["section", "Section"],
  ["company", "Company"],
  ["contactName", "Contact Name"],
  ["titleRole", "Title / Role"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["website", "Website"],
  ["entityType", "Entity Type"],
  ["primaryNiche", "Primary Niche / Specialty"],
  ["programs", "Programs / Loan Types"],
  ["propertyTypes", "Property Types"],
  ["exclusions", "Exclusions"],
  ["statesServed", "States Served"],
  ["ownerOrInvestor", "Owner-Occupied or Investor"],
  ["fundingAmountMin", "Funding amount - Min"],
  ["fundingAmountMax", "Funding amount - Max"],
  ["ltv", "LTV / Leverage"],
  ["interestRates", "Interest Rates"],
  ["amortTerm", "Amortization / Term"],
  ["referralFees", "Referral / YSP Fees"],
  ["notes", "Additional Notes"],
  ["status", "Status"],
  ["lastUpdated", "Last Updated"],
];

function loadEnv() {
  const envPath = path.join(APP_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, k, raw] = m;
    const v = raw.replace(/^['"]|['"]$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

function findCsv(): string {
  const candidates = [
    path.resolve(APP_ROOT, "..", "Comprehensive_Lender_List.csv"),
    path.join(APP_ROOT, "scripts", "seed.csv"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error(
    "Could not find Comprehensive_Lender_List.csv. Put it at " +
      candidates.join(" or ")
  );
}

function parseCsv(csvText: string) {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
  });
  const records: Record<string, string>[] = [];
  for (const row of result.data) {
    let empty = true;
    const rec: Record<string, string> = {};
    for (const [field, header] of FIELDS_TO_CSV) {
      const val = (row[header] ?? "").trim();
      rec[field] = val;
      if (val) empty = false;
    }
    if (empty) continue;
    if (!rec.company) continue;
    if (rec.company.toUpperCase().startsWith("EXAMPLE")) continue;
    records.push(rec);
  }
  return records;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    console.error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` once to create a deployment,\n" +
        "then re-run `npm run seed`."
    );
    process.exit(1);
  }

  const csvPath = findCsv();
  console.log("Reading CSV from:", csvPath);
  const csv = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const records = parseCsv(csv);
  console.log(`Parsed ${records.length} records`);

  const client = new ConvexHttpClient(url);

  const CHUNK = 100;
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const result = (await client.mutation(api.lenders.bulkUpsert as never, {
      records: chunk,
    })) as { inserted: number; updated: number; total: number };
    inserted += result.inserted;
    updated += result.updated;
    process.stdout.write(
      `  Processed ${Math.min(i + CHUNK, records.length)}/${records.length}\r`
    );
  }
  console.log();
  console.log(`Done. Inserted: ${inserted}, Updated: ${updated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
