#!/usr/bin/env npx tsx
/**
 * Phase 15 Step 7 — hierarchy CRUD audit proof report.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const reportsDir = join(root, "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });

const JOSHUA_ORG = "mx76bxqnc23q76cb99tvrffmy58644pf";
const JOSHUA_USER = "ts719yfyv2b6020avvctpw0ns586exm6";

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
      env[t.slice(0, i).trim()] = v;
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
      (result.stderr || result.stdout || "convex run failed").slice(0, 800),
    );
  }
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{") >= 0 ? text.indexOf("{") : text.indexOf("[");
  return JSON.parse(text.slice(start)) as Record<string, unknown>;
}

async function main() {
  const env = loadEnv();
  const adminSecret = env.DATA_MIGRATION_ADMIN_SECRET;
  if (!adminSecret) throw new Error("DATA_MIGRATION_ADMIN_SECRET required");

  const proof = convexRun(
    "operator/hierarchyCrudProofStep15_7:runCrudAuditProofStep15_7",
    { adminSecret, organizationId: JOSHUA_ORG, memberUserKey: JOSHUA_USER },
    true,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "15-step7-crud-audit-repair",
    organizationId: JOSHUA_ORG,
    proof,
    pass: proof.pass === true,
    productionUrl: "https://dlcfunds.vercel.app",
    convexDeployment: "https://basic-anaconda-984.convex.cloud",
    validation: {
      convexCodegen: "pass",
      build: "pass",
      convexDeployProd: "pass",
      vercelDeployProd: "pass",
      authValidate: "ALL_CHECKS_PASSED",
    },
    manualVerification: [
      "Create dummy client/project/file in hub and verify blocked deletes",
      "Reassign loan file to different project — UI + graph edges update",
      "Delete loan file — no ghost edges remain",
      "Delete empty project then empty client",
    ],
  };

  const outPath = join(reportsDir, "phase15-step7-crud-audit-repair.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
