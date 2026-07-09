#!/usr/bin/env npx tsx
/**
 * Phase 16 Step 2 — event schema foundation proof (prod Convex).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const reportsDir = join(root, "..", "migration-reports");
const docsDir = join(root, "..", "docs");
mkdirSync(reportsDir, { recursive: true });

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [".env.local", ".env.testing", ".env.convex.prod"]) {
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
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || "convex run failed").slice(0, 4000),
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
    "operator/eventFoundationStep16_2:runEventFoundationProof",
    { adminSecret },
    true,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    phase: 16,
    step: 2,
    title: "Event system schema foundation",
    proof,
    pass: Boolean(proof.pass),
  };

  const outPath = join(
    reportsDir,
    "phase16-step2-event-foundation.json",
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  const mdPath = join(docsDir, "phase16-step2-event-foundation.md");
  const steps = (proof.steps as Array<{ name: string; pass: boolean }>) ?? [];
  const md = `# Phase 16 Step 2 — Event schema foundation

**Date:** ${new Date().toISOString().slice(0, 10)}  
**Status:** ${report.pass ? "PASS" : "FAIL"}  
**Evidence:** \`migration-reports/phase16-step2-event-foundation.json\`

## Summary

Additive Convex schema for owner-scoped Events domain with canonical \`resourceShares\` ACL extension (\`event\`, \`event_idea\`, \`event_invitation\`, \`event_template\`) and \`collaboratorRole\` (co_owner, editor, viewer).

## Proof matrix

| Check | Result |
|-------|--------|
${steps.map((s) => `| ${s.name} | ${s.pass ? "PASS" : "FAIL"} |`).join("\n")}

## STOP gate

Step 3 (sharing UI + mutations) not started. No calendar, print engine, or product UI.

`;

  writeFileSync(mdPath, md);

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
