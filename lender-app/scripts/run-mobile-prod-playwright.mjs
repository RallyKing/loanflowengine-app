#!/usr/bin/env node
/**
 * Run mobile-focused Playwright against a deployed URL (production smoke).
 *
 * Usage:
 *   node scripts/run-mobile-prod-playwright.mjs https://your-app.vercel.app
 *
 * Requires APP_AUTH_USERNAME / APP_AUTH_PASSWORD for authenticated specs.
 * Does not start a local webServer (uses PW_BASE_URL).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const base = process.argv[2]?.trim();
if (!base?.startsWith("http")) {
  console.error("Usage: node scripts/run-mobile-prod-playwright.mjs <https://production-url>");
  process.exit(1);
}

const env = {
  ...process.env,
  PW_BASE_URL: base.replace(/\/+$/, ""),
  CI: process.env.CI ?? "1",
};

const r = spawnSync(
  "npx",
  [
    "playwright",
    "test",
    "tests/mobile",
    "--project=Mobile Chrome",
    "--project=Mobile Safari",
  ],
  { cwd: appRoot, env, stdio: "inherit", shell: true },
);

process.exit(r.status ?? 1);
