/**
 * Production-safe planning query: workspace keys vs canonical auth user for Joshua's email.
 *
 * Uses the same Convex URL resolution as `run-full-ownership-migration.ts`
 * (prefers `.env.convex.prod` over `.env.local`).
 *
 *   npm run migration:planJoshua
 *   npm run migration:planJoshua -- other@email.com
 *   npm run migration:planJoshua -- --out migration-reports/plan.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";
import {
  loadAdminSecret,
  loadConvexUrlRaw,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv";

const DEFAULT_EMAIL = "joshua@directlendingconnection.com";

function convexUrlForOperator(): string | undefined {
  const prodPath = join(process.cwd(), ".env.convex.prod");
  if (existsSync(prodPath)) {
    for (const line of readFileSync(prodPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      if (k !== "NEXT_PUBLIC_CONVEX_URL") continue;
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    }
  }
  return loadConvexUrlRaw();
}

function parseArgs(): { email: string; outPath?: string } {
  const raw = process.argv.slice(2);
  let outPath: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "--out" && raw[i + 1]) {
      outPath = raw[i + 1]!;
      i++;
      continue;
    }
    rest.push(raw[i]!);
  }
  const email =
    rest.find((a) => !a.startsWith("-"))?.trim() || DEFAULT_EMAIL;
  return { email, outPath };
}

async function main() {
  const adminSecret = loadAdminSecret();
  if (!adminSecret) {
    printMissingAdminSecretDiagnostics();
    process.exit(1);
  }
  const { email, outPath } = parseArgs();
  const parsed = parseConvexPublicUrl(convexUrlForOperator());
  if (!parsed.ok) {
    console.error("NEXT_PUBLIC_CONVEX_URL missing or invalid (check .env.convex.prod / .env.local).");
    process.exit(1);
  }

  const client = new ConvexHttpClient(parsed.href);
  const plan = await client.query(
    api.accountOwnershipMigration.planAccountOwnershipMigration,
    { adminSecret, email },
  );

  const text = JSON.stringify(plan, null, 2);
  console.log(text);

  if (outPath) {
    const resolved = outPath.startsWith("/") || /^[A-Za-z]:/.test(outPath)
      ? outPath
      : join(process.cwd(), outPath);
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(resolved, text, "utf8");
    console.error(`Wrote ${resolved}`);
  }

  if (plan.ok === true && plan.otherAuthKeysStillReferenced.length > 0) {
    process.exitCode = 2;
    console.error(
      "[plan] otherAuthKeysStillReferenced non-empty — merge those accounts or fix data before a clean tenant.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
