/**
 * One-shot: mark getting-started complete for an auth user by email (userPreferences + legacy rows).
 *
 * Env: `loadAdminSecret` from operator env files; Convex URL from `.env.convex.prod` (same as run-full-ownership-migration).
 *
 * Usage:
 *   npx tsx scripts/operator-mark-getting-started-complete.ts joshua@directlendingconnection.com
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import {
  loadAdminSecret,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv";

function convexUrlForOperator(): string | undefined {
  const prodPath = join(process.cwd(), ".env.convex.prod");
  if (existsSync(prodPath)) {
    for (const line of readFileSync(prodPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      if (t.slice(0, i).trim() !== "NEXT_PUBLIC_CONVEX_URL") continue;
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
  return undefined;
}

async function main() {
  const email = process.argv.slice(2).find((a) => !a.startsWith("-"))?.trim();
  if (!email) {
    console.error("Usage: npx tsx scripts/operator-mark-getting-started-complete.ts <email>");
    process.exit(1);
  }
  const adminSecret = loadAdminSecret();
  if (!adminSecret) {
    printMissingAdminSecretDiagnostics();
    process.exit(1);
  }
  const url = convexUrlForOperator();
  if (!url) {
    console.error("Missing NEXT_PUBLIC_CONVEX_URL in .env.convex.prod");
    process.exit(1);
  }
  const { api } = (await import("../convex/_generated/api.js")) as {
    api: typeof import("../convex/_generated/api").api;
  };
  const client = new ConvexHttpClient(url);
  const result = await client.mutation(
    api.userOnboarding.operatorMarkGettingStartedCompleteByEmail,
    { adminSecret, email },
  );
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
