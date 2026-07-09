#!/usr/bin/env npx tsx
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
    "operator/eventQcStep16_3A:runEventQcStep16_3AProof",
    { adminSecret },
    true,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    phase: 16,
    step: "3A",
    title: "Events usability + functional QC stabilization",
    proof,
    pass: Boolean(proof.pass),
  };

  writeFileSync(
    join(reportsDir, "phase16-step3A-events-qc.json"),
    JSON.stringify(report, null, 2),
  );

  const steps = (proof.steps as Array<{ name: string; pass: boolean }>) ?? [];
  writeFileSync(
    join(docsDir, "phase16-step3A-events-qc.md"),
    `# Phase 16 Step 3A — Events QC stabilization

**Status:** ${report.pass ? "PASS" : "FAIL"}
**Evidence:** \`migration-reports/phase16-step3A-events-qc.json\`

## Proof matrix

| Check | Result |
|-------|--------|
${steps.map((s) => `| ${s.name} | ${s.pass ? "PASS" : "FAIL"} |`).join("\n")}

## Scope

Usability and QC stabilization only — no calendar, print, automation, or Step 4.

## STOP gate

Do not start Step 4 until operator review.
`,
  );

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
