#!/usr/bin/env npx tsx
/**
 * Phase 13.3 Step 3 — analyze → execute → proof → migration report.
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

async function main() {
  const env = loadEnv();
  const adminSecret = env.DATA_MIGRATION_ADMIN_SECRET;
  if (!adminSecret) throw new Error("DATA_MIGRATION_ADMIN_SECRET missing");

  const analyze = convexRun(
    "operator/pipelineHierarchyBackfillStep13_3:analyzeBackfill",
    { adminSecret },
  );

  const execute = convexRun(
    "operator/pipelineHierarchyBackfillStep13_3:executeBackfill",
    { adminSecret, dryRun: false },
  );

  const proof = convexRun(
    "operator/pipelineHierarchyBackfillStep13_3:runBackfillProof",
    { adminSecret },
  );

  const report = {
    generatedAt: Date.now(),
    phase: "13.3-step3-backfill",
    analyze,
    execute,
    proof,
    validation: {
      note: "Run npm run convex:codegen, build, convex:deploy:prod, deploy:prod, auth:validate after code deploy.",
    },
  };

  writeFileSync(
    join(reportsDir, "phase13-step3-backfill.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));

  const exec = execute as { joshuaBefore?: unknown; joshuaAfter?: unknown };
  const execPass =
    JSON.stringify(exec.joshuaBefore) === JSON.stringify(exec.joshuaAfter);
  const proofPass = (proof as { pass?: boolean }).pass === true;
  if (!proofPass || !execPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
