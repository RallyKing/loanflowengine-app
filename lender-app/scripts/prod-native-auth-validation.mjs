/**
 * Production native auth checklist (Convex-backed `/api/auth/login`, not APP_AUTH_* shortcut).
 *
 * Env:
 *   PROD_SCROLL_BASE / PW_BASE_URL — production origin (required if the team alias is stale;
 *     latest prod host is printed by `vercel ls`; alias loanflowengine.vercel.app may 404.)
 *   PROD_LOGIN_EMAIL / PROD_LOGIN_PASSWORD — credentials to validate
 *
 * Example:
 *   PROD_LOGIN_EMAIL=a@b.com PROD_LOGIN_PASSWORD='secret' node scripts/prod-native-auth-validation.mjs
 */
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
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
    if (process.env[k] === undefined || process.env[k] === "") {
      process.env[k] = v;
    }
  }
}

function loadEnvTesting() {
  const p = join(root, ".env.testing");
  if (!existsSync(p)) return;
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
    if (process.env[k] === undefined || process.env[k] === "") {
      process.env[k] = v;
    }
  }
}

loadEnvLocal();
loadEnvTesting();

const BASE = process.env.PROD_SCROLL_BASE?.trim() || process.env.PW_BASE_URL?.trim() || "";

const EMAIL =
  process.env.PROD_LOGIN_EMAIL?.trim() ||
  process.env.APP_AUTH_PRIMARY_EMAIL?.trim() ||
  process.env.APP_AUTH_USERNAME?.trim() ||
  "";
const PASSWORD =
  process.env.PROD_LOGIN_PASSWORD ??
  process.env.APP_AUTH_PRIMARY_PASSWORD ??
  process.env.APP_AUTH_PASSWORD ??
  "";

function pass(label) {
  console.log(`PASS: ${label}`);
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function loginViaApi(page, label) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const res = await page.evaluate(
    async ({ u, p }) => {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      let body = null;
      try {
        body = await r.json();
      } catch {
        body = null;
      }
      return { ok: r.ok, status: r.status, body };
    },
    { u: EMAIL, p: PASSWORD },
  );
  if (!res.ok) {
    fail(
      `${label}: /api/auth/login HTTP ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  pass(`${label} (HTTP ${res.status})`);
}

async function assertSignedIn(page) {
  const signOut = page.getByRole("button", { name: /^Sign out$/i });
  await signOut.waitFor({ state: "visible", timeout: 90_000 });
  await page
    .getByTestId("app-masterpage-chrome")
    .waitFor({ state: "visible", timeout: 15_000 });
}

async function assertOrgScopeOk(page) {
  await page.waitForFunction(
    () => {
      const v = globalThis.localStorage?.getItem("lender.activeOrganizationId");
      return (
        typeof v === "string" &&
        v.length >= 10 &&
        v.length <= 96 &&
        /^[a-z0-9]+$/.test(v)
      );
    },
    { timeout: 90_000 },
  );
  const banner = page.getByText(/workspace scope could not be verified/i);
  const vis = await banner.isVisible().catch(() => false);
  if (vis) fail("Organization scope: recovery banner visible (scope not resolved)");
  const orgId = await page.evaluate(() =>
    globalThis.localStorage?.getItem("lender.activeOrganizationId"),
  );
  const idOk =
    typeof orgId === "string" &&
    orgId.length >= 10 &&
    orgId.length <= 96 &&
    /^[a-z0-9]+$/.test(orgId);
  if (!idOk) {
    fail(
      `Organization resolution: expected Convex org id in localStorage, got: ${orgId ?? "null"}`,
    );
  }
  pass("Organization resolution (localStorage active org + no scope banner)");
}

async function assertPermissionsLoaded(page) {
  /** Settings org section loads only when RBAC / org context is usable. */
  await page.goto(`${BASE}/settings#appearance`, {
    waitUntil: "domcontentloaded",
  });
  await assertSignedIn(page);
  await page.getByRole("heading", { name: /^Settings$/i }).waitFor({
    state: "visible",
    timeout: 60_000,
  });
  await page.getByRole("link", { name: /^Organization$/i }).first().waitFor({
    state: "visible",
    timeout: 60_000,
  });
  pass("Permission resolution (settings shell + Organization nav visible)");
}

async function assertDashboardTasks(page) {
  await page.goto(`${BASE}/tasks`, { waitUntil: "domcontentloaded" });
  await assertSignedIn(page);
  await page.getByRole("heading", { name: /^Tasks$/i }).first().waitFor({
    state: "visible",
    timeout: 90_000,
  });
  pass("Dashboard access (/tasks Tasks heading)");
}

async function assertLoggedOut(page) {
  await page.goto(`${BASE}/pipeline`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  const pw = page.locator('input[type="password"]');
  await pw.waitFor({ state: "visible", timeout: 15_000 });
  pass("Logout (pipeline redirects to /login, password field visible)");
}

async function logoutViaApi(page) {
  const res = await page.evaluate(async () => {
    const r = await fetch("/api/auth/logout", { method: "POST" });
    const body = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, body };
  });
  if (!res.ok) {
    fail(`/api/auth/logout HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  pass(`Logout API (HTTP ${res.status})`);
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    fail(
      "Set PROD_LOGIN_EMAIL / PROD_LOGIN_PASSWORD or APP_AUTH_PRIMARY_* / APP_AUTH_* credentials",
    );
  }

  console.log("PROD_NATIVE_AUTH_VALIDATION", BASE, "user", EMAIL);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    await loginViaApi(page, "1. Login success");
    await page.goto(`${BASE}/pipeline`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Pipeline/i }).waitFor({
      state: "visible",
      timeout: 90_000,
    });
    await page.getByText("Loading pipeline…").waitFor({
      state: "detached",
      timeout: 60_000,
    });
    await assertSignedIn(page);
    pass("2. Session persistence (pipeline loaded, Sign out visible)");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Pipeline/i }).waitFor({
      state: "visible",
      timeout: 90_000,
    });
    await assertSignedIn(page);
    pass("3. Refresh persistence (reload still signed in)");

    await assertOrgScopeOk(page);

    await logoutViaApi(page);
    await assertLoggedOut(page);

    await loginViaApi(page, "5. Relogin");
    await assertPermissionsLoaded(page);
    await assertDashboardTasks(page);

    console.log("\nALL_CHECKS_PASSED", BASE);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
