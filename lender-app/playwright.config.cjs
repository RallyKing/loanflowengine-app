// @ts-check
const { defineConfig, devices } = require("@playwright/test");
const { existsSync, readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const crypto = require("node:crypto");

/** @param {string} root @param {string} name */
function loadEnvFile(root, name) {
  const p = join(root, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined || process.env[k] === "") {
      process.env[k] = v;
    }
  }
}

const repoRoot = process.cwd();
loadEnvFile(repoRoot, ".env.local");
loadEnvFile(repoRoot, ".env.testing");

/**
 * @param {NodeJS.ProcessEnv} e
 * @returns {Record<string, string>}
 */
function toStringRecord(e) {
  const o = {};
  for (const [k, v] of Object.entries(e)) {
    if (v !== undefined) o[k] = v;
  }
  return o;
}

const PW_PORT = process.env.PW_TEST_PORT || "3005";
const remoteBase = process.env.PW_BASE_URL?.trim();
const baseURL = remoteBase || `http://127.0.0.1:${PW_PORT}`;

const webEnv = toStringRecord({ ...process.env });

/** Decrypt Playwright storage state blobs into playwright/.auth/ when configured. */
function materializeEncryptedAuthStates() {
  const keyHex = process.env.TEST_SESSION_ENCRYPTION_KEY?.trim();
  const authDir = join(repoRoot, "tests", "auth");
  const outDir = join(repoRoot, "playwright", ".auth");
  if (!keyHex || keyHex.length < 64) return;
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) return;
  if (!existsSync(authDir)) return;
  mkdirSync(outDir, { recursive: true });
  const { readdirSync, statSync } = require("node:fs");
  for (const name of readdirSync(authDir)) {
    if (!name.endsWith(".enc")) continue;
    const encPath = join(authDir, name);
    if (!statSync(encPath).isFile()) continue;
    const raw = readFileSync(encPath);
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(body), decipher.final()]);
    const outName = name.replace(/\.enc$/, ".json");
    writeFileSync(join(outDir, outName), dec);
  }
}

materializeEncryptedAuthStates();

const storageState = process.env.PW_STORAGE_STATE?.trim()
  ? process.env.PW_STORAGE_STATE.trim()
  : undefined;

/** Extended handset profiles only run `tests/mobile/**` (keeps `npm run test:e2e` bounded). */
const mobileOnlyMatch = /mobile\/.*\.spec\.ts$/;

/** `PW_TRACE=on` → retain all traces (heavy); CI default `retain-on-failure`. */
const traceMode =
  process.env.PW_TRACE?.trim() === "on"
    ? "on"
    : process.env.CI
      ? "retain-on-failure"
      : "on-first-retry";

const sharedUse = {
  baseURL,
  trace: traceMode,
  screenshot: "only-on-failure",
  video: "retain-on-failure",
  ...(storageState ? { storageState } : {}),
};

module.exports = defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: sharedUse,
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 50,
      animations: "disabled",
    },
  },
  projects: [
    {
      name: "chromium",
      testIgnore: [/tests\/visual\//],
      use: { ...devices["Desktop Chrome"], ...sharedUse },
    },
    {
      name: "firefox",
      testIgnore: [/tests\/visual\//],
      use: { ...devices["Desktop Firefox"], ...sharedUse },
    },
    {
      name: "edge",
      testIgnore: [/tests\/visual\//],
      use: { ...devices["Desktop Edge"], ...sharedUse },
    },
    {
      name: "webkit",
      testIgnore: [/tests\/visual\//],
      use: { ...devices["Desktop Safari"], ...sharedUse },
    },
    {
      name: "tablet",
      testIgnore: [/tests\/visual\//],
      use: { ...devices["iPad Pro 11"], ...sharedUse },
    },
    {
      name: "Mobile Chrome",
      testIgnore: [/tests\/visual\//],
      use: { ...devices["Pixel 7"], ...sharedUse },
    },
    {
      name: "Mobile Chrome Galaxy",
      testMatch: mobileOnlyMatch,
      testIgnore: [/tests\/visual\//],
      use: { ...devices["Galaxy S24"], ...sharedUse },
    },
    {
      name: "Mobile Safari",
      testIgnore: [/tests\/visual\//],
      use: { ...devices["iPhone 14 Pro"], ...sharedUse },
    },
    {
      name: "Mobile Safari SE",
      testMatch: mobileOnlyMatch,
      testIgnore: [/tests\/visual\//],
      use: { ...devices["iPhone SE (3rd gen)"], ...sharedUse },
    },
    {
      name: "iPad",
      testMatch: mobileOnlyMatch,
      testIgnore: [/tests\/visual\//],
      use: { ...devices["iPad Pro 11"], ...sharedUse },
    },
    /** Pipeline workspace-sheet suite — extended handset profiles (see docs/workspace-sheet-testing-report.md). */
    {
      name: "Workspace sheet iPhone 15 Pro Max",
      testMatch: /tests\/mobile\/workspace-sheet\/.*\.spec\.ts$/,
      testIgnore: [/tests\/visual\//],
      use: { ...devices["iPhone 15 Pro Max"], ...sharedUse },
    },
    {
      name: "Workspace sheet Pixel 8 Pro",
      testMatch: /tests\/mobile\/workspace-sheet\/.*\.spec\.ts$/,
      testIgnore: [/tests\/visual\//],
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2.625,
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      },
    },
    {
      name: "Workspace sheet Galaxy Fold",
      testMatch: /tests\/mobile\/workspace-sheet\/.*\.spec\.ts$/,
      testIgnore: [/tests\/visual\//],
      use: {
        ...devices["Galaxy S24"],
        viewport: { width: 344, height: 882 },
      },
    },
    {
      name: "Workspace sheet iPad Pro",
      testMatch: /tests\/mobile\/workspace-sheet\/.*\.spec\.ts$/,
      testIgnore: [/tests\/visual\//],
      use: { ...devices["iPad Pro 11"], ...sharedUse },
    },
    {
      name: "visual-desktop",
      testMatch: /tests\/visual\/.+\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], ...sharedUse },
    },
    {
      name: "visual-mobile-pixel",
      testMatch: /tests\/visual\/.+\.spec\.ts/,
      use: { ...devices["Pixel 7"], ...sharedUse },
    },
    {
      name: "visual-mobile-iphone14pro",
      testMatch: /tests\/visual\/.+\.spec\.ts/,
      use: { ...devices["iPhone 14 Pro"], ...sharedUse },
    },
    {
      name: "visual-mobile-ipad",
      testMatch: /tests\/visual\/.+\.spec\.ts/,
      use: { ...devices["iPad Pro 11"], ...sharedUse },
    },
  ],
  ...(remoteBase
    ? {}
    : {
        webServer: {
          command: `npx next start -H 127.0.0.1 -p ${PW_PORT}`,
          url: baseURL,
          env: {
            ...webEnv,
            /** WebKit rejects `Secure` cookies on http://127.0.0.1; `next start` uses NODE_ENV=production. */
            PW_ALLOW_INSECURE_SESSION_COOKIE:
              process.env.PW_ALLOW_INSECURE_SESSION_COOKIE ?? "1",
            /**
             * `next start` otherwise shares login rate limits across parallel specs
             * (`bridgedRateConsume`). Production never sets this.
             */
            PLAYWRIGHT_RELAX_LOGIN_RATE_LIMIT: "1",
          },
          // Reusing an existing process is unsafe after `npm run build`: a stale
          // `next start` or `next dev` may serve HTML whose CSS chunk no longer
          // exists on disk (`link.sheet` stays null → body overflow stays visible).
          reuseExistingServer: process.env.PW_REUSE_EXISTING_SERVER === "1",
          timeout: 120_000,
        },
      }),
});
