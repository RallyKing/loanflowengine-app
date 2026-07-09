/**
 * Phase 21.7 — verify FileTaskTriageComposer mounts on production.
 * Usage: PW_BASE_URL=https://dlcfunds.vercel.app node scripts/verify-phase21-step7-triage-ui.mjs
 */
import { chromium } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(name) {
  const p = join(process.cwd(), name);
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

loadEnvFile(".env.local");

const baseURL =
  process.env.PW_BASE_URL?.trim() || "https://dlcfunds.vercel.app";

const username =
  process.env.APP_AUTH_PRIMARY_EMAIL?.trim() ??
  process.env.APP_AUTH_USERNAME?.trim() ??
  "";
const password =
  process.env.APP_AUTH_PRIMARY_PASSWORD ?? process.env.APP_AUTH_PASSWORD ?? "";

if (!username || !password) {
  console.error("Missing APP_AUTH_USERNAME / APP_AUTH_PASSWORD in .env.local");
  process.exit(2);
}

const consoleHits = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL });
const page = await context.newPage();

page.on("console", (msg) => {
  const text = msg.text();
  if (
    text.includes("Rendering NEW Triage Composer") ||
    text.includes("Rendering NEW FileTasksBlock")
  ) {
    consoleHits.push(text);
  }
});

await page.goto("/login", { waitUntil: "domcontentloaded" });
const origin = new URL(page.url()).origin;
const loginRes = await page.request.post("/api/auth/login", {
  data: { username, password },
  headers: { Origin: origin },
});
if (!loginRes.ok()) {
  console.error("Login failed:", loginRes.status(), await loginRes.text());
  await browser.close();
  process.exit(1);
}

await page.goto("/pipeline", { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(3000);

const fileLink = page.locator('a[href^="/pipeline/"]').first();
if ((await fileLink.count()) === 0) {
  console.error("No pipeline file links found on hub");
  await browser.close();
  process.exit(1);
}
await fileLink.click();
await page.waitForURL(/\/pipeline\/[^/?#]+/, { timeout: 60_000 });
await page.waitForTimeout(4000);

const tasksHeader = page.getByRole("button", { name: /^Tasks$/i }).first();
if ((await tasksHeader.count()) === 0) {
  console.error("Tasks collapsible section not found");
  await browser.close();
  process.exit(1);
}

const expanded = await tasksHeader.getAttribute("aria-expanded");
if (expanded !== "true") {
  await tasksHeader.click();
  await page.waitForTimeout(1500);
}

const composer = page.getByTestId("file-task-triage-composer");
const block = page.getByTestId("file-tasks-triage-block");
const urgent = page.getByTestId("file-task-toggle-urgent");
const schedule = page.getByTestId("file-task-toggle-schedule");

const results = {
  blockVisible: await block.isVisible().catch(() => false),
  composerVisible: await composer.isVisible().catch(() => false),
  urgentVisible: await urgent.isVisible().catch(() => false),
  scheduleVisible: await schedule.isVisible().catch(() => false),
  urgentLabel: await urgent.textContent().catch(() => ""),
  scheduleLabel: await schedule.textContent().catch(() => ""),
  consoleHits,
  url: page.url(),
};

console.log(JSON.stringify(results, null, 2));

await browser.close();

const ok =
  results.composerVisible &&
  results.urgentVisible &&
  results.scheduleVisible &&
  consoleHits.some((m) => m.includes("Rendering NEW Triage Composer")) &&
  consoleHits.some((m) => m.includes("FileTasksBlock"));

process.exit(ok ? 0 : 1);
