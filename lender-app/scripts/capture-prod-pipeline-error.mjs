/**
 * Production forensics — login via API, load /pipeline, capture pageerror stacks.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.argv[2]?.trim() || "https://lender-app-zeta.vercel.app";

function loadEnv() {
  const out = {};
  for (const f of [".env.testing", ".env.local"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), f), "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].trim();
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

const env = loadEnv();
const username =
  env.APP_AUTH_PRIMARY_EMAIL || env.APP_AUTH_USERNAME || "";
const password =
  env.APP_AUTH_PRIMARY_PASSWORD || env.APP_AUTH_PASSWORD || "";

const captured = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("pageerror", (err) => {
    captured.push({
      kind: "pageerror",
      message: err.message,
      stack: err.stack ?? null,
    });
  });

  console.log("=== FORENSICS ===");
  console.log("BASE_URL", baseUrl);
  console.log("LOGIN_USER", username ? `${username.slice(0, 3)}…` : "(none)");

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const origin = new URL(page.url()).origin;
  const loginRes = await page.request.post(`${origin}/api/auth/login`, {
    data: { username, password },
    headers: { Origin: origin },
  });
  console.log("LOGIN_STATUS", loginRes.status(), await loginRes.text().catch(() => ""));

  await page.goto(`${baseUrl}/pipeline`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12_000);

  const buildInfo = await page.evaluate(() => (window).__DLC_BUILD_INFO ?? null);
  console.log("DLC_BUILD_INFO", JSON.stringify(buildInfo, null, 2));

  const hubVisible = await page
    .locator("[data-pipeline-hub-hierarchy], [data-testid='pipeline-hub-hierarchy']")
    .count();
  console.log("HUB_HIERARCHY_NODES", hubVisible);

  // Try opening first file link if present
  const fileLink = page.locator("[data-pipeline-row]").first();
  if (await fileLink.count()) {
    await fileLink.click().catch(() => {});
    await page.waitForTimeout(8_000);
  }

  console.log("FINAL_URL", page.url());
  console.log("CAPTURED_ERRORS", JSON.stringify(captured, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
