#!/usr/bin/env npx tsx
/**
 * Phase 15 Step 14 — project primary cleanup + report.
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
      (result.stderr || result.stdout || "convex run failed").slice(0, 1200),
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

  const dryRun = convexRun(
    "operator/fixDuplicateProjectPrimaries:runFixDuplicateProjectPrimaries",
    { adminSecret, organizationId: JOSHUA_ORG, dryRun: true },
    true,
  );

  const applied = convexRun(
    "operator/fixDuplicateProjectPrimaries:runFixDuplicateProjectPrimaries",
    { adminSecret, organizationId: JOSHUA_ORG, dryRun: false },
    true,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "15-step14-workspace-compaction",
    organizationId: JOSHUA_ORG,
    projectPrimaryCleanup: {
      dryRun,
      applied,
      repairedProjects: applied.repairedProjects ?? 0,
      demotedProjectLinks: applied.demotedProjectLinks ?? 0,
      deletedDuplicatePrimaryRows: applied.deletedDuplicatePrimaryRows ?? 0,
      ensuredFkPrimaryLinks: applied.ensuredFkPrimaryLinks ?? 0,
      scannedProjects: applied.scannedProjects ?? 0,
    },
    workspaceHeader: {
      state: "useState(false) headerDetailsExpanded in PipelineFileWorkspace",
      defaultCollapsed: true,
      compactRow:
        "Back to hub, file name, momentum stars, stage badges, expand toggle",
      expandedPanel:
        "Project assignment, loan clients, breadcrumbs, switch file, ownership, presence",
    },
    productionUrl: "https://dlcfunds.vercel.app",
    convexDeployment: "https://basic-anaconda-984.convex.cloud",
  };

  const outPath = join(
    reportsDir,
    "phase15-step14-workspace-compaction.json",
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
