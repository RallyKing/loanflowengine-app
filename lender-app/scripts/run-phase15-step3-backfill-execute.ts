#!/usr/bin/env npx tsx
/**
 * Phase 15 Step 3 — indexed graph backfill execute report (production writes).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const reportsDir = join(root, "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });

const ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf";

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [".env.local", ".env.testing"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
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
      const k = t.slice(0, i).trim();
      if (!env[k]) env[k] = v;
    }
  }
  return env;
}

function convexRun(fn: string, args: Record<string, unknown>, prod = true) {
  const bin = join(root, "node_modules", "convex", "bin", "main.js");
  const argv = [bin, "run"];
  if (prod) argv.push("--prod");
  argv.push(fn, JSON.stringify(args));
  const result = spawnSync(process.execPath, argv, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${fn}: ${(result.stderr || result.stdout || "convex run failed").slice(0, 800)}`,
    );
  }
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{") >= 0 ? text.indexOf("{") : text.indexOf("[");
  return JSON.parse(text.slice(start)) as Record<string, unknown>;
}

async function main() {
  const env = loadEnv();
  const adminSecret = env.DATA_MIGRATION_ADMIN_SECRET;
  if (!adminSecret) {
    throw new Error("DATA_MIGRATION_ADMIN_SECRET required in .env.local");
  }

  const executeResult = convexRun(
    "operator/indexedGraphBackfillStep15_3:executeAndProveStep15_3",
    { adminSecret, organizationId: ORG_ID },
    true,
  );

  const backfill = executeResult.backfill as Record<string, unknown>;
  const proof = executeResult.proof as Record<string, unknown> | undefined;

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "15-step3-backfill-execute",
    organizationId: ORG_ID,
    dryRun: false,
    pass: executeResult.pass === true,
    aborted: executeResult.aborted === true,
    abortReason: executeResult.abortReason ?? null,
    rowsInserted: backfill?.inserted ?? null,
    skippedExisting: backfill?.skippedExisting ?? null,
    ambiguitiesSkipped: backfill?.ambiguitiesSkipped ?? [],
    duplicatesCollapsed: backfill?.collapses ?? [],
    integrityScan: backfill?.integrity ?? null,
    joshuaZeroDrift: {
      drift: backfill?.joshuaDrift === true,
      before: backfill?.joshuaBefore ?? null,
      after: backfill?.joshuaAfter ?? null,
    },
    eballardVisibilityProof: {
      drift: backfill?.eballardDrift === true,
      before: backfill?.eballardBefore ?? null,
      after: backfill?.eballardAfter ?? null,
      resolverPass: executeResult.eballardResolverPass === true,
    },
    resourceShares: {
      drift: backfill?.sharesDrift === true,
      before: backfill?.sharesBefore ?? null,
      after: backfill?.sharesAfter ?? null,
    },
    resolverProof: proof?.resolverProof ?? null,
    analyze: proof?.analyze ?? null,
    matrix: proof?.matrix ?? null,
  };

  const outPath = join(reportsDir, "phase15-step3-backfill-execute.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(
    JSON.stringify(
      {
        pass: report.pass,
        inserted: report.rowsInserted,
        collapses: (report.duplicatesCollapsed as unknown[])?.length ?? 0,
        integrityPass: (report.integrityScan as { pass?: boolean })?.pass,
        joshuaDrift: report.joshuaZeroDrift.drift,
        eballardDrift: report.eballardVisibilityProof.drift,
      },
      null,
      2,
    ),
  );

  if (!report.pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
