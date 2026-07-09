/**
 * Elevate one auth user to global admin (isGlobalAdmin + SUPER_ADMIN).
 *
 *   npx tsx scripts/grant-global-admin.ts joshua@directlendingconnection.com
 *   npx tsx scripts/grant-global-admin.ts joshua@directlendingconection.com
 *
 * Requires DATA_MIGRATION_ADMIN_SECRET (or ORG_INTEGRITY_ADMIN_SECRET) and
 * NEXT_PUBLIC_CONVEX_URL — see scripts/lib/migrationOperatorEnv.ts
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";
import {
  loadAdminSecret,
  loadConvexUrlPreferProd,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv";

async function main() {
  const adminSecret = loadAdminSecret();
  if (!adminSecret) {
    printMissingAdminSecretDiagnostics();
    process.exit(1);
  }
  const parsed = parseConvexPublicUrl(loadConvexUrlPreferProd() ?? "");
  if (!parsed.ok) {
    console.error("NEXT_PUBLIC_CONVEX_URL missing or invalid.");
    process.exit(1);
  }

  const loginOrEmail =
    process.argv.slice(2).find((a) => !a.startsWith("-"))?.trim() ??
    "joshua@directlendingconnection.com";

  const client = new ConvexHttpClient(parsed.href);
  const out = await client.mutation(
    api.auth.globalAdminBootstrap.grantGlobalAdminByLoginOrEmail,
    { adminSecret, loginOrEmail },
  );
  console.error(JSON.stringify(out, null, 2));
  if (!("ok" in out) || !out.ok) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
