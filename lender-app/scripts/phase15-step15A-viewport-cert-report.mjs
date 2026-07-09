#!/usr/bin/env node
/**
 * Runs Phase 15A mobile viewport Playwright suite against production and writes
 * migration-reports/phase15-step15A-mobile-viewport-certification.json
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const lenderAppRoot = join(__dirname, "..");
const repoRoot = join(lenderAppRoot, "..");
const reportPath = join(
  repoRoot,
  "migration-reports",
  "phase15-step15A-mobile-viewport-certification.json",
);

const baseUrl =
  process.env.PW_BASE_URL?.trim() || "https://dlcfunds.vercel.app";

const result = spawnSync(
  "npx",
  [
    "playwright",
    "test",
    "tests/e2e/phase15-step15A-mobile-viewport.spec.ts",
    "--project",
    "chromium",
    "--reporter=line",
  ],
  {
    cwd: lenderAppRoot,
    env: { ...process.env, PW_BASE_URL: baseUrl },
    encoding: "utf8",
    shell: true,
  },
);

const stdout = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const passed = /(\d+) passed/.exec(stdout);
const failed = /(\d+) failed/.exec(stdout);
const skipped = /(\d+) skipped/.exec(stdout);

const payload = {
  phase: "15",
  step: "15A",
  title: "Mobile viewport stabilization (root cause fix)",
  date: new Date().toISOString().slice(0, 10),
  productionUrl: baseUrl,
  viewportMatrix: [
    "320x568",
    "375x812",
    "390x844",
    "414x896",
    "768x1024",
    "1024x768",
  ],
  canonicalViewport: {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    pinchZoomDisabled: false,
    source: "lender-app/app/layout.tsx export const viewport",
  },
  fixes: [
    "html max-width:100% + overflow-x:clip",
    "--dlc-viewport-inline:100dvw token",
    "100vw→100dvw on overlay/dropdown anchors",
    "pipeline hub stage chips: w-max inside overflow-x-auto scrollport",
    "pipeline hub filter selects: flex-1 min-w-0 on narrow",
    "pipeline-hub-hierarchy-shell overflow-x-clip",
  ],
  playwright: {
    status: result.status === 0 ? "pass" : "fail",
    exitCode: result.status ?? 1,
    passed: passed ? Number(passed[1]) : null,
    failed: failed ? Number(failed[1]) : null,
    skipped: skipped ? Number(skipped[1]) : null,
    spec: "lender-app/tests/e2e/phase15-step15A-mobile-viewport.spec.ts",
  },
  validation: {
    note: "Populate convexCodegen/build/deploy/authValidate after npm run chain in session",
  },
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${reportPath}`);
process.exit(result.status ?? 1);
