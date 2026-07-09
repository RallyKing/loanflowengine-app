#!/usr/bin/env npx tsx
/**
 * Phase 14 Step 1 — multi-client junction analyze → execute → proof → report.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const reportsDir = join(root, "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });

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

function convexRun(fn: string, args: Record<string, unknown>) {
  const bin = join(root, "node_modules", "convex", "bin", "main.js");
  const result = spawnSync(
    process.execPath,
    [bin, "run", "--prod", fn, JSON.stringify(args)],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "convex run failed");
  }
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{") >= 0 ? text.indexOf("{") : text.indexOf("[");
  return JSON.parse(text.slice(start)) as Record<string, unknown>;
}

async function rebuildSearch(cursor: string | null = null): Promise<void> {
  const page = convexRun("globalSearchSync:rebuildPipelineGlobalSearchPage", {
    limit: 500,
    cursor,
  }) as { isDone: boolean; continueCursor: string | null };
  if (!page.isDone && page.continueCursor) {
    await rebuildSearch(page.continueCursor);
  }
}

async function main() {
  const env = loadEnv();
  const adminSecret = env.DATA_MIGRATION_ADMIN_SECRET;
  if (!adminSecret) throw new Error("DATA_MIGRATION_ADMIN_SECRET missing");

  const analyze = convexRun(
    "operator/pipelineMultiClientFoundationStep14_1:analyzeMultiClientFoundation",
    { adminSecret },
  );

  const execute = convexRun(
    "operator/pipelineMultiClientFoundationStep14_1:executeMultiClientFoundation",
    { adminSecret, dryRun: false },
  );

  if ((execute as { aborted?: boolean }).aborted) {
    throw new Error(
      `Backfill aborted: ${(execute as { abortReason?: string }).abortReason}`,
    );
  }

  await rebuildSearch();

  const proof = convexRun(
    "operator/pipelineMultiClientFoundationStep14_1:runMultiClientFoundationProof",
    { adminSecret },
  );

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "14-step1-multi-client-foundation",
    pass: Boolean((proof as { pass?: boolean }).pass),
    analyze,
    execute,
    proof,
  };

  const outPath = join(
    reportsDir,
    "phase14-step1-multi-client-foundation.json",
  );
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify({ pass: report.pass }, null, 2));

  if (!report.pass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
