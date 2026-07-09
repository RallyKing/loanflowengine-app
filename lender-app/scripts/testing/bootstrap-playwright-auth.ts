/**
 * One-off: mint Playwright storageState after a successful `/api/auth/login`.
 *
 * Usage (from lender-app/):
 *   PW_TEST_PORT=3005 npx tsx scripts/testing/bootstrap-playwright-auth.ts org_owner
 *
 * Writes `playwright/.auth/<persona>.json` (gitignored). Point Playwright at it:
 *   PW_STORAGE_STATE=playwright/.auth/org_owner.json npm run test:e2e
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { E2ETestPersona } from "../../lib/testing/e2eUserCatalog";
import { E2E_USER_CATALOG } from "../../lib/testing/e2eUserCatalog";

function loadEnvFile(name: string) {
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

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env.testing");
  const persona = (process.argv[2] || "org_owner") as E2ETestPersona;
  const entry = E2E_USER_CATALOG.find((e) => e.persona === persona);
  if (!entry || persona === "client_portal") {
    throw new Error("Invalid persona for workspace cookie bootstrap.");
  }
  const pass = process.env[`E2E_PASS_${entry.passEnvSuffix}`];
  if (!pass) throw new Error(`Set E2E_PASS_${entry.passEnvSuffix}`);

  const port = process.env.PW_TEST_PORT || "3005";
  const base = process.env.PW_BASE_URL?.trim() || `http://127.0.0.1:${port}`;
  const outDir = join(process.cwd(), "playwright", ".auth");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${persona}.json`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: base });
  const res = await ctx.request.post("/api/auth/login", {
    data: { username: entry.username, password: pass },
  });
  if (!res.ok()) {
    throw new Error(`Login failed ${res.status()}: ${await res.text()}`);
  }
  await ctx.storageState({ path: out });
  await browser.close();
  console.log("Wrote", out);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
