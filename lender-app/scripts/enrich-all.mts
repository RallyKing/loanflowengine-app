/**
 * Run AI enrichment on lenders still missing core info (programs / niche),
 * in batches, until a batch returns nothing to process or max rounds.
 *
 * Requires: `.env.local` with NEXT_PUBLIC_CONVEX_URL, and Convex deployment
 * env: OPENAI_API_KEY or PERPLEXITY_API_KEY.
 *
 * Env overrides:
 *   ENRICH_BATCH (default 20) — lenders per Convex action invocation
 *   ENRICH_MAX_ROUNDS (default 200) — safety cap
 *   ENRICH_DELAY_MS (default 800) — passed to enrichMissing (between lenders)
 *
 * Usage:  npm run enrich:all
 */
import { ConvexHttpClient } from "convex/browser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { api } = (await import("../convex/_generated/api.js")) as typeof import("../convex/_generated/api");

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

loadEnv();

const url =
  process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL || "";
if (!url) {
  console.error(
    "Set NEXT_PUBLIC_CONVEX_URL in .env.local (run `npx convex dev` once)."
  );
  process.exit(1);
}

const BATCH = Math.min(
  25,
  Math.max(1, parseInt(process.env.ENRICH_BATCH || "20", 10) || 20)
);
const MAX_ROUNDS = Math.min(
  1000,
  Math.max(1, parseInt(process.env.ENRICH_MAX_ROUNDS || "200", 10) || 200)
);
const DELAY_MS = Math.min(
  5000,
  Math.max(0, parseInt(process.env.ENRICH_DELAY_MS || "800", 10) || 800)
);

const client = new ConvexHttpClient(url);

async function main() {
  let rounds = 0;
  let totalOk = 0;
  let totalFailed = 0;
  let totalFilled = 0;

  console.log(
    `Enriching incomplete lenders (batches of ${BATCH}, delay ${DELAY_MS}ms between rows)…\n`
  );

  while (rounds < MAX_ROUNDS) {
    const stats = (await client.query(api.lenders.stats, {})) as {
      incompleteCount: number;
    };
    if (stats.incompleteCount === 0) {
      console.log("No incomplete lenders left (stats). Done.");
      break;
    }

    const res = (await client.action(api.enrich.enrichMissing, {
      limit: BATCH,
      summaryOnly: true,
      delayMs: DELAY_MS,
    })) as {
      total: number;
      succeeded: number;
      failed: number;
      filled: number;
    };
    rounds += 1;
    totalOk += res.succeeded;
    totalFailed += res.failed;
    totalFilled += res.filled;

    const after = (await client.query(api.lenders.stats, {})) as {
      incompleteCount: number;
    };

    console.log(
      `Round ${rounds}: batch ${res.total} · ok ${res.succeeded} · failed ${res.failed} · fields filled ${res.filled} · remaining ~${after.incompleteCount} incomplete`
    );

    if (res.total === 0) {
      console.log(
        "\nNo ids in batch — stopping (database may need lenderStats backfill or no matches)."
      );
      break;
    }

    if (after.incompleteCount === 0) {
      console.log("\nAll lenders now have programs + niche (or stats caught up). Done.");
      break;
    }
  }

  if (rounds >= MAX_ROUNDS) {
    console.log(
      `\nStopped after ${MAX_ROUNDS} rounds (safety cap). Re-run \`npm run enrich:all\` to continue.`
    );
  }

  console.log(
    `\nTotals: ${totalOk} ok / ${totalFailed} failed · ${totalFilled} field slots filled · ${rounds} round(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
