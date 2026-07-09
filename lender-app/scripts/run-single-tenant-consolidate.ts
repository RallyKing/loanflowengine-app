/**
 * Bind all workspace rows to the primary account org + owner (single-tenant).
 *
 *   npx tsx scripts/run-single-tenant-consolidate.ts              # dry run
 *   npx tsx scripts/run-single-tenant-consolidate.ts --execute
 *   npx tsx scripts/run-single-tenant-consolidate.ts --execute --surface-pipeline
 *
 * Uses `.env.convex.prod` for Convex URL when present (see migrationOperatorEnv).
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
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

  const execute = process.argv.includes("--execute");
  const surface = process.argv.includes("--surface-pipeline");
  const noLenderRescope = process.argv.includes("--no-rescope-lenders");
  const orgArg = process.argv.find(
    (a) => a.startsWith("--org="),
  );
  const orgId = orgArg?.slice("--org=".length).trim() || undefined;

  const client = new ConvexHttpClient(parsed.href);
  const args: {
    adminSecret: string;
    dryRun: boolean;
    surfacePipeline: boolean;
    rescopeOtherOrgLenders: boolean;
    organizationId?: Id<"organizations">;
  } = {
    adminSecret,
    dryRun: !execute,
    surfacePipeline: surface,
    rescopeOtherOrgLenders: !noLenderRescope,
  };
  if (orgId) args.organizationId = orgId as Id<"organizations">;

  console.error(
    JSON.stringify(
      {
        mode: execute ? "execute" : "dry-run",
        surfacePipeline: surface,
        rescopeOtherOrgLenders: !noLenderRescope,
        organizationId: orgId ?? "(auth user default)",
      },
      null,
      2,
    ),
  );

  const out = await client.mutation(
    api.migrations.singleTenantConsolidateAllData.consolidateAllDataToPrimaryOrg,
    args,
  );
  console.error(JSON.stringify(out, null, 2));
  if (!(out as { ok?: boolean }).ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
