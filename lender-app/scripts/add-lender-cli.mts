/**
 * Command-line helper to add a single lender record via a JSON payload.
 *
 * Usage:
 *   npx tsx scripts/add-lender-cli.mts '{"company":"Acme","email":"x@y.com"}'
 *
 * Uses `lenders:operatorUpsert` (DATA_MIGRATION_ADMIN_SECRET on Convex) or
 * authenticated `lenders:upsert` when org scope is in .env.local.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadOperatorOrgScope,
  loadOperatorSecret,
} from "./lib/operatorConvexIdentity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");

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

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    console.error("NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` first.");
    process.exit(1);
  }
  const raw = process.argv[2];
  if (!raw) {
    console.error(
      "Usage: npx tsx scripts/add-lender-cli.mts '<json>'\n" +
        "Pass a JSON object with at least { \"company\": \"...\" }.",
    );
    process.exit(2);
  }
  let payload: Record<string, string>;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    console.error("Invalid JSON:", err instanceof Error ? err.message : err);
    process.exit(3);
  }
  if (!payload.company) {
    console.error('Payload must include a non-empty "company" field.');
    process.exit(4);
  }
  const client = new ConvexHttpClient(url);
  try {
    const secret = loadOperatorSecret();
    const result = await client.mutation(api.lenders.operatorUpsert, {
      operatorSecret: secret,
      ...payload,
    });
    console.log(JSON.stringify(result));
    return;
  } catch {
    /* fall through to session-scoped upsert */
  }
  const scope = loadOperatorOrgScope();
  const result = await client.mutation(api.lenders.upsert, {
    ...scope,
    ...payload,
  });
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
