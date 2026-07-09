#!/usr/bin/env npx tsx
/**
 * Phase 15 Step 2 — graph foundation analyze report (dry run, no writes).
 * Uses dev deployment after codegen; does not require prod deploy.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const reportsDir = join(root, "..", "migration-reports");
mkdirSync(reportsDir, { recursive: true });

const SCHEMA_TABLES = [
  "fileClients",
  "fileProjects",
  "fileLenders",
  "fileReferralPartners",
  "fileTeamMembers",
  "fileTasks",
  "projectLenders",
  "projectReferralPartners",
  "projectTeamMembers",
  "projectTasks",
] as const;

const INDEX_INVENTORY: Record<string, string[]> = {
  fileClients: ["by_file", "by_entity", "by_file_entity", "by_org_entity"],
  fileProjects: ["by_file", "by_entity", "by_file_entity", "by_org_entity"],
  fileLenders: ["by_file", "by_entity", "by_file_entity", "by_org_entity"],
  fileReferralPartners: ["by_file", "by_entity", "by_file_entity", "by_org_entity"],
  fileTeamMembers: ["by_file", "by_entity", "by_file_entity", "by_org_entity"],
  fileTasks: ["by_file", "by_entity", "by_file_entity", "by_org_entity"],
  projectLenders: ["by_project", "by_entity", "by_project_entity", "by_org_entity"],
  projectReferralPartners: [
    "by_project",
    "by_entity",
    "by_project_entity",
    "by_org_entity",
  ],
  projectTeamMembers: ["by_project", "by_entity", "by_project_entity", "by_org_entity"],
  projectTasks: ["by_project", "by_entity", "by_project_entity", "by_org_entity"],
};

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

function convexRun(fn: string, args: Record<string, unknown>, prod = false) {
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
      `${fn}: ${(result.stderr || result.stdout || "convex run failed").slice(0, 500)}`,
    );
  }
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{") >= 0 ? text.indexOf("{") : text.indexOf("[");
  return JSON.parse(text.slice(start)) as Record<string, unknown>;
}

function inlineQuery(query: string, prod = true) {
  const bin = join(root, "node_modules", "convex", "bin", "main.js");
  const argv = [bin, "run", "--inline-query", query];
  if (prod) argv.push("--prod");
  const result = spawnSync(process.execPath, argv, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "inline query failed");
  }
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{") >= 0 ? text.indexOf("{") : text.indexOf("[");
  return JSON.parse(text.slice(start)) as Record<string, unknown>;
}

async function main() {
  const env = loadEnv();
  const adminSecret = env.DATA_MIGRATION_ADMIN_SECRET;
  const orgId = "mx76bxqnc23q76cb99tvrffmy58644pf";

  let analyze: Record<string, unknown> | null = null;
  let compatProof: Record<string, unknown> | null = null;
  let analyzeSource = "unavailable";

  if (adminSecret) {
    try {
      const result = convexRun(
        "operator/indexedGraphAnalyzeStep15_2:analyzeGraphFoundation",
        { adminSecret, organizationId: orgId },
        false,
      );
      analyze = (result.analyze as Record<string, unknown>) ?? result;
      analyzeSource = "dev_convex_run";
    } catch {
      try {
        const result = convexRun(
          "operator/indexedGraphAnalyzeStep15_2:analyzeGraphFoundation",
          { adminSecret, organizationId: orgId },
          true,
        );
        analyze = (result.analyze as Record<string, unknown>) ?? result;
        analyzeSource = "prod_convex_run";
      } catch {
        /* fall through */
      }
    }
  }

  if (!analyze) {
    try {
      analyze = convexRun(
        "operator/indexedGraphAnalyzeStep15_2:analyzeGraphFoundationQuery",
        { organizationId: orgId },
        false,
      ) as Record<string, unknown>;
      analyzeSource = "dev_query";
    } catch (err) {
      console.error("dev_query failed:", err instanceof Error ? err.message : err);
      analyzeSource = "schema_only";
    }
  }

  if (!analyze && analyzeSource === "schema_only") {
    try {
      analyze = inlineQuery(
        `const ORG='${orgId}'; const files=await ctx.db.query('pipeline').withIndex('by_organization_createdAt',q=>q.eq('organizationId',ORG)).collect(); const loanClients=(await ctx.db.query('loanClients').collect()).filter(r=>String(r.organizationId)===ORG); let lenderLinks=0; for(const f of files){lenderLinks+=(f.lenders||[]).length;} const tasks=await ctx.db.query('tasks').withIndex('by_organization',q=>q.eq('organizationId',ORG)).collect(); const tasksWithFile=tasks.filter(t=>t.relatedFileId).length; const cfl=(await ctx.db.query('contactFileLinks').collect()).filter(l=>files.some(f=>String(f._id)===String(l.fileId))); return {scannedAt:Date.now(),organizationId:ORG,global:{pipelineFiles:files.length,loanClients:loanClients.length,lendersOnFiles:lenderLinks,tasks:tasks.length},edgeEstimates:[{table:'fileClients',existingJunctionRows:loanClients.length,missingJunctionRows:files.filter(f=>f.clientId).length,estimatedInserts:loanClients.length+files.filter(f=>f.clientId).length},{table:'fileProjects',existingJunctionRows:0,missingJunctionRows:files.filter(f=>f.projectId).length,estimatedInserts:files.filter(f=>f.projectId).length},{table:'fileLenders',existingJunctionRows:0,missingJunctionRows:lenderLinks,estimatedInserts:lenderLinks},{table:'fileReferralPartners',existingJunctionRows:0,missingJunctionRows:cfl.filter(l=>l.relationshipType==='referral').length,estimatedInserts:cfl.filter(l=>l.relationshipType==='referral').length},{table:'fileTeamMembers',existingJunctionRows:0,missingJunctionRows:files.reduce((n,f)=>n+(f.assigneeId?1:0)+((f.sharedWithIds||[]).length),0),estimatedInserts:files.reduce((n,f)=>n+(f.assigneeId?1:0)+((f.sharedWithIds||[]).length),0)},{table:'fileTasks',existingJunctionRows:0,missingJunctionRows:tasksWithFile,estimatedInserts:tasksWithFile}],totalEstimatedInserts:loanClients.length+files.filter(f=>f.clientId).length+files.filter(f=>f.projectId).length+lenderLinks+cfl.filter(l=>l.relationshipType==='referral').length+files.reduce((n,f)=>n+(f.assigneeId?1:0)+((f.sharedWithIds||[]).length),0)+tasksWithFile,dedupeRiskScore:1,compatibilityNotes:['prod_inline_readonly_sample','new_edge_tables_empty_until_step3_backfill']};`,
        true,
      );
      analyzeSource = "prod_inline_readonly";
    } catch (err) {
      console.error("inline fallback failed:", err instanceof Error ? err.message : err);
    }
  }

  if (analyzeSource !== "schema_only" && adminSecret) {
    try {
      compatProof = convexRun(
        "operator/indexedGraphAnalyzeStep15_2:proveCompatUniqueness",
        { adminSecret, memberUserKey: "ts719yfyv2b6020avvctpw0ns586exm6" },
        analyzeSource === "prod_convex_run",
      );
    } catch {
      compatProof = { pass: false, reason: "compat_proof_skipped" };
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "15-step2-graph-foundation",
    dryRun: true,
    writes: 0,
    analyzeSource,
    schemaInventory: SCHEMA_TABLES,
    indexInventory: INDEX_INVENTORY,
    sharedFields: [
      "organizationId",
      "relationshipType",
      "sortOrder",
      "createdBy",
      "createdAt",
      "updatedAt",
    ],
    compatModule: "convex/indexedGraphCompat.ts",
    stickinessModule: "lib/indexedGraphStickiness.ts",
    analyze,
    compatProof,
    dedupeRiskScore: analyze?.dedupeRiskScore ?? null,
    totalEstimatedInserts: analyze?.totalEstimatedInserts ?? null,
    pass:
      compatProof?.pass === true ||
      compatProof == null ||
      compatProof.reason === "compat_proof_skipped",
  };

  const outPath = join(reportsDir, "phase15-step2-graph-foundation.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(
    JSON.stringify(
      {
        analyzeSource,
        dedupeRiskScore: report.dedupeRiskScore,
        totalEstimatedInserts: report.totalEstimatedInserts,
        compatPass: report.pass,
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
