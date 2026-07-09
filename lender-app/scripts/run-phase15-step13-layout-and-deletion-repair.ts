#!/usr/bin/env npx tsx
/**
 * Phase 15 Step 13 — empty file deletion proof report.
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
    "operator/emptyFileDeletionProofStep15_13:runEmptyFileDeletionProofStep15_13",
    { adminSecret, organizationId: JOSHUA_ORG, memberUserKey: JOSHUA_USER },
    true,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "15-step13-layout-and-deletion-repair",
    organizationId: JOSHUA_ORG,
    proof,
    pass: proof.pass === true,
    productionUrl: "https://dlcfunds.vercel.app",
    convexDeployment: "https://basic-anaconda-984.convex.cloud",
    layout: {
      approach:
        "AppChrome early return for /pipeline/[fileId]: no sidebar, master header, or bottom nav; workspace scroll delegated; fullBleed WorkspaceContentContainer",
    },
    deletion: {
      rootCause:
        "Owner key on hierarchy create could disagree with JWT-resolved delete actor; satellite rows (messages, collaboration, assignments) now cleaned before pipeline row delete",
    },
  };

  const outPath = join(
    reportsDir,
    "phase15-step13-layout-and-deletion-repair.json",
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
