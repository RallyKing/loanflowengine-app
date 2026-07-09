#!/usr/bin/env npx tsx
/**
 * Phase 13.3 Step 5 — full hard certification orchestrator.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const repoRoot = join(root, "..");
const reportsDir = join(repoRoot, "migration-reports");
const docsDir = join(repoRoot, "docs");
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

function run(cmd: string, args: string[], label: string) {
  const t0 = Date.now();
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
    env: process.env,
    shell: process.platform === "win32",
  });
  const elapsedMs = Date.now() - t0;
  const ok = result.status === 0;
  return {
    label,
    ok,
    elapsedMs,
    status: result.status,
    stdout: (result.stdout || "").slice(-8000),
    stderr: (result.stderr || "").slice(-4000),
  };
}

function convexRun(fn: string, args: Record<string, unknown>) {
  const bin = join(root, "node_modules", "convex", "bin", "main.js");
  const result = spawnSync(
    process.execPath,
    [bin, "run", "--prod", fn, JSON.stringify(args)],
    { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "convex run failed");
  }
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{") >= 0 ? text.indexOf("{") : text.indexOf("[");
  return JSON.parse(text.slice(start)) as Record<string, unknown>;
}

function matrixRow(
  id: string,
  pass: boolean,
  detail: string,
): { id: string; pass: boolean; detail: string } {
  return { id, pass, detail };
}

async function main() {
  const startedAt = Date.now();
  const env = loadEnv();
  const adminSecret = env.DATA_MIGRATION_ADMIN_SECRET;
  if (!adminSecret) throw new Error("DATA_MIGRATION_ADMIN_SECRET missing");

  const validationSteps = [
    ["npm", ["run", "convex:codegen"]],
    ["npm", ["run", "build"]],
    ["npm", ["run", "convex:deploy:prod"]],
    ["npm", ["run", "deploy:prod"]],
    ["npm", ["run", "auth:validate"]],
  ] as const;

  const validationRuns = validationSteps.map(([cmd, args]) =>
    run(cmd, [...args], cmd === "npm" ? args.join(" ") : cmd),
  );

  const convexStarted = Date.now();
  const convexProof = convexRun(
    "operator/pipelineHierarchyHardCertificationStep13_5:runHierarchyHardCertification",
    { adminSecret },
  );
  const convexElapsedMs = Date.now() - convexStarted;

  const prodUrl = "https://dlcfunds.vercel.app";
  const pwEnv = {
    ...process.env,
    PW_BASE_URL: prodUrl,
    PLAYWRIGHT_USE_PRIMARY_AUTH: "1",
  };
  const pwStarted = Date.now();
  const pwResult = spawnSync(
    "npx",
    [
      "playwright",
      "test",
      "tests/e2e/phase13-step5-hierarchy-hard-certification.spec.ts",
      "--project=chromium",
      "--workers=1",
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024,
      env: pwEnv,
      shell: process.platform === "win32",
    },
  );
  const playwrightElapsedMs = Date.now() - pwStarted;
  const pw = {
    label: "playwright hierarchy certification",
    ok: pwResult.status === 0,
    elapsedMs: playwrightElapsedMs,
    status: pwResult.status,
    stdout: (pwResult.stdout || "").slice(-8000),
    stderr: (pwResult.stderr || "").slice(-4000),
  };

  const matrix = [
    ...validationRuns.map((v) =>
      matrixRow(v.label, v.ok, v.ok ? `${v.elapsedMs}ms` : v.stderr || v.stdout),
    ),
    matrixRow(
      "convex.hierarchyHardCertification",
      (convexProof as { pass?: boolean }).pass === true,
      `elapsed ${convexElapsedMs}ms`,
    ),
    matrixRow(
      "browser.playwright",
      pw.ok,
      pw.ok ? `${playwrightElapsedMs}ms` : pw.stderr || pw.stdout,
    ),
    matrixRow(
      "acl.eballardConvexProof",
      (convexProof as { checks?: { projectViewBannerGray?: boolean } }).checks
        ?.projectViewBannerGray === true,
      "project share view/edit/revoke via operator mutation",
    ),
  ];

  const pass = matrix.every((m) => m.pass);
  const report = {
    generatedAt: Date.now(),
    phase: "13.3-step5-hard-certification",
    productionUrl: prodUrl,
    pass,
    elapsedMs: Date.now() - startedAt,
    matrix,
    validationRuns,
    convexProof,
    convexElapsedMs,
    playwright: { ...pw, elapsedMs: playwrightElapsedMs },
    performance: {
      convexProofElapsedMs: convexElapsedMs,
      playwrightElapsedMs,
    },
    joshuaDrift: {
      pass: (convexProof as { checks?: { joshuaDriftZero?: boolean } }).checks
        ?.joshuaDriftZero,
      before: (convexProof as { joshuaBefore?: unknown }).joshuaBefore,
      after: (convexProof as { joshuaAfter?: unknown }).joshuaAfter,
    },
    aclProof: (convexProof as { aclProbe?: unknown }).aclProbe,
    writeBudgetNote:
      "Hub 5m idle write cap enforced in Playwright (HUB_IDLE_MAX_TOTAL_WRITES=2).",
  };

  writeFileSync(
    join(reportsDir, "phase13-step5-hard-certification.json"),
    JSON.stringify(report, null, 2) + "\n",
  );

  const md = `# Phase 13.3 Step 5 — Hard certification

**Production:** ${prodUrl}  
**Generated:** ${new Date(report.generatedAt).toISOString()}  
**Result:** ${pass ? "PASS" : "FAIL"}

## Pass/fail matrix

| Check | Pass | Detail |
|-------|------|--------|
${matrix.map((m) => `| ${m.id} | ${m.pass ? "yes" : "no"} | ${m.detail.replace(/\|/g, "\\|").slice(0, 120)} |`).join("\n")}

## Timings

- Total: ${report.elapsedMs}ms
- Convex proof: ${convexElapsedMs}ms
- Playwright: ${playwrightElapsedMs}ms

## Joshua drift

- Zero drift: ${report.joshuaDrift.pass === true ? "yes" : "no"}

## ACL (eballard / project share path)

See \`migration-reports/phase13-step5-hard-certification.json\` → \`convexProof.aclProbe\`.

## Performance / idle writes

- Hub idle: Playwright soak + \`HUB_IDLE_MAX_TOTAL_WRITES=${2}\`
- Subscriptions: Playwright asserts single \`listTablePreview\` on hub

## STOP

Certification only — do not begin Phase 14.
`;

  writeFileSync(join(docsDir, "phase13-step5-hard-certification.md"), md + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
