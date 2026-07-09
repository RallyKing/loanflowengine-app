#!/usr/bin/env npx tsx
/**
 * Phase 15 Step 15 — global canonical sharing certification (prod Convex).
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
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || "convex run failed").slice(0, 2000),
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

  const readiness = convexRun(
    "operator/phase15Step15SharingCertification:scanPlatformSharingReadiness",
    { adminSecret },
    true,
  );

  const proof = convexRun(
    "operator/phase15Step15SharingCertification:runGlobalSharingCertification",
    { adminSecret, repairFirst: true },
    true,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "15",
    step: "15",
    title: "Global canonical sharing certification + repair",
    productionUrl: "https://dlcfunds.vercel.app",
    convexDeployment: "https://basic-anaconda-984.convex.cloud",
    readiness,
    proof,
    pass: proof.pass === true,
    certAccounts: [
      "joshua@directlendingconnection.com",
      "joshuaeballard@gmail.com",
      "joshuaeballar1@gmail.com",
    ],
  };

  const outPath = join(
    reportsDir,
    "phase15-step15-sharing-certification.json",
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  const mdPath = join(docsDir, "phase15-step15-sharing-certification.md");
  const md = `# Phase 15 Step 15 — Global canonical sharing certification

**Date:** ${report.generatedAt.slice(0, 10)}  
**Production:** ${report.productionUrl}  
**Evidence:** \`migration-reports/phase15-step15-sharing-certification.json\`

## Result

**${report.pass ? "PASS" : "FAIL"}** — platform sharing certification matrix.

## Canonical resolver path

\`resolveShareTargetUserKey\` → \`findAuthUserForShareResolution\` → \`collectAuthUsersByCanonicalLogin\` (NFKC username + normalized email + Gmail dot/plus variants).

## Repairs applied

Automatic \`repairAuthIdentityPlatform\` (identity field normalization, duplicate email merge, org-member dedupe, orphan share cleanup).

## Certification accounts

| Email | In org | Resolved |
|-------|--------|----------|
${(proof.accounts as Array<{ email: string; inOrg: boolean; userKey: string | null }>)
  .map((a) => `| ${a.email} | ${a.inOrg ? "yes" : "no"} | ${a.userKey ?? "—"} |`)
  .join("\n")}

## Live matrix

See JSON \`proof.matrix.steps\` for A↔B task/file share, upgrade/downgrade, revoke, ownership transfer, notification label checks.

## STOP

Do not begin Phase 16 Events until operator approves this certification on production.
`;
  writeFileSync(mdPath, md);

  console.log(JSON.stringify({ pass: report.pass, outPath, mdPath }, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
