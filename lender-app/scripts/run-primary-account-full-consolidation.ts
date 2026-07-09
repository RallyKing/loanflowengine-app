/**
 * Primary native account consolidation for single-owner deployments.
 *
 * - Writes docs/pre-migration-convex-audit.md (integrity + plan snapshot)
 * - With `--execute`: ensurePrimaryPlatformAdmin → merge (all workspace keys + other authUsers)
 *   → finalizePrimaryNativeOwnership → normalize casing → purge legacy external auth
 * - Writes docs/convex-primary-account-migration-report.md
 *
 * Usage:
 *   npx tsx scripts/run-primary-account-full-consolidation.ts           # audit docs only
 *   npx tsx scripts/run-primary-account-full-consolidation.ts --execute # full migration
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl.js";
import {
  loadAdminSecret,
  loadConvexUrlRaw,
  lenderAppRoot,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv.js";

const PRIMARY_EMAIL = "joshua@directlendingconnection.com";

function convexUrlPreferProdSync(): string | undefined {
  const prodPath = join(lenderAppRoot, ".env.convex.prod");
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

function mdHeader(title: string): string {
  return `# ${title}\n\n_Generated: ${new Date().toISOString()}_\n\n`;
}

function mdJsonBlock(label: string, data: unknown): string {
  return `## ${label}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n\n`;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const adminSecret = loadAdminSecret();
  if (!adminSecret) {
    printMissingAdminSecretDiagnostics();
    process.exit(1);
  }

  const parsed = parseConvexPublicUrl(convexUrlPreferProdSync() ?? loadConvexUrlRaw());
  if (!parsed.ok) {
    console.error("NEXT_PUBLIC_CONVEX_URL missing or invalid (.env.convex.prod / .env.local).");
    process.exit(1);
  }

  const client = new ConvexHttpClient(parsed.href);
  const docsDir = join(lenderAppRoot, "docs");
  mkdirSync(docsDir, { recursive: true });
  const prePath = join(docsDir, "pre-migration-convex-audit.md");
  const postPath = join(docsDir, "convex-primary-account-migration-report.md");

  const integrityPre = await client.query(api.dataMigration.integrityAudit, {
    adminSecret,
    scanLimitPerTable: 200_000,
  });
  const planPre = await client.query(
    api.accountOwnershipMigration.planAccountOwnershipMigration,
    { adminSecret, email: PRIMARY_EMAIL },
  );
  let orgPre: unknown;
  try {
    orgPre = await client.query(api.orgIntegrity.validateOrganizationIntegrity, {
      adminSecret,
      memberSample: 5000,
      rowSample: 2000,
    });
  } catch {
    orgPre = {
      note:
        "Query failed: ORG_INTEGRITY_ADMIN_SECRET on the deployment must match DATA_MIGRATION_ADMIN_SECRET when using the same secret from .env files.",
    };
  }

  writeFileSync(
    prePath,
    mdHeader("Pre-migration Convex audit (primary account consolidation)")
      + `**Deployment URL:** ${parsed.href}\n\n`
      + mdJsonBlock("integrityAudit", integrityPre)
      + mdJsonBlock("planAccountOwnershipMigration", planPre)
      + mdJsonBlock("validateOrganizationIntegrity (sampled)", orgPre)
      + "## Scope\n\n"
      + "This audit is generated from live Convex queries. It lists table counts, legacy vendor / Clerk-shaped key hits, "
      + "and workspace keys that are not the canonical auth id for the primary email.\n",
    "utf8",
  );
  console.error("Wrote", prePath);

  if (!execute) {
    writeFileSync(
      postPath,
      mdHeader("Convex primary account migration report")
        + "Migration **not executed** (re-run with `--execute`).\n\n"
        + mdJsonBlock("pre-migration summary", {
          joshua: (integrityPre as { joshua?: unknown }).joshua,
          planOk: (planPre as { ok?: boolean }).ok,
        }),
      "utf8",
    );
    console.error("Wrote", postPath, "(execute skipped)");
    return;
  }

  const steps: unknown[] = [];

  const ensured = await client.mutation(
    api.auth.globalAdminBootstrap.ensurePrimaryPlatformAdmin,
    { adminSecret },
  );
  steps.push({ step: 1, name: "ensurePrimaryPlatformAdmin", result: ensured });
  if (!ensured.ok) {
    throw new Error(`ensurePrimaryPlatformAdmin failed: ${JSON.stringify(ensured)}`);
  }
  const canonicalAuthUserId = ensured.userId as Id<"authUsers">;

  const plan = await client.query(
    api.accountOwnershipMigration.planAccountOwnershipMigration,
    { adminSecret, email: PRIMARY_EMAIL },
  );
  if (!plan.ok || !("suggestedAdditionalKeysToRekey" in plan)) {
    throw new Error(`planAccountOwnershipMigration failed: ${JSON.stringify(plan)}`);
  }
  const otherIds = (plan as { otherAuthKeysStillReferenced: string[] })
    .otherAuthKeysStillReferenced.map((id) => id as Id<"authUsers">);

  const mergeDry = await client.mutation(
    api.migrations.mergeAuthUsersByEmail.mergeAuthUsersByEmail,
    {
      adminSecret,
      email: PRIMARY_EMAIL,
      matchUsernameAsEmail: true,
      canonicalAuthUserId,
      additionalKeysToRekey: plan.suggestedAdditionalKeysToRekey,
      rekeyAdditionalAuthUserIds: otherIds.length ? otherIds : undefined,
      deleteRekeyedAdditionalAuthUsers: otherIds.length > 0,
      dryRun: true,
    },
  );
  steps.push({ step: 2, name: "mergeAuthUsersByEmail_dryRun", result: mergeDry });

  const mergeExec = await client.mutation(
    api.migrations.mergeAuthUsersByEmail.mergeAuthUsersByEmail,
    {
      adminSecret,
      email: PRIMARY_EMAIL,
      matchUsernameAsEmail: true,
      canonicalAuthUserId,
      additionalKeysToRekey: plan.suggestedAdditionalKeysToRekey,
      rekeyAdditionalAuthUserIds: otherIds.length ? otherIds : undefined,
      deleteRekeyedAdditionalAuthUsers: otherIds.length > 0,
      dryRun: false,
    },
  );
  steps.push({ step: 3, name: "mergeAuthUsersByEmail_execute", result: mergeExec });
  if (!mergeExec.ok) {
    throw new Error(`mergeAuthUsersByEmail failed: ${JSON.stringify(mergeExec)}`);
  }

  const finalized = await client.mutation(
    api.migrations.finalizePrimaryNativeOwnership.finalizePrimaryNativeOwnership,
    { adminSecret, email: PRIMARY_EMAIL, matchUsernameAsEmail: true, dryRun: false },
  );
  steps.push({ step: 4, name: "finalizePrimaryNativeOwnership", result: finalized });

  const normalized = await client.mutation(
    api.migrations.normalizeAuthUserCasing.normalizeAuthUserCasing,
    { adminSecret, dryRun: false },
  );
  steps.push({ step: 5, name: "normalizeAuthUserCasing", result: normalized });

  const purged = await client.mutation(
    api.migrations.purgeLegacyExternalAuth.purgeLegacyExternalAuth,
    { adminSecret, dryRun: false },
  );
  steps.push({ step: 6, name: "purgeLegacyExternalAuth", result: purged });

  const integrityPost = await client.query(api.dataMigration.integrityAudit, {
    adminSecret,
    scanLimitPerTable: 200_000,
  });
  const planPost = await client.query(
    api.accountOwnershipMigration.planAccountOwnershipMigration,
    { adminSecret, email: PRIMARY_EMAIL },
  );
  let orgPost: unknown;
  try {
    orgPost = await client.query(api.orgIntegrity.validateOrganizationIntegrity, {
      adminSecret,
      memberSample: 5000,
      rowSample: 2000,
    });
  } catch (e) {
    orgPost = { error: String(e) };
  }

  writeFileSync(
    postPath,
    mdHeader("Convex primary account migration report")
      + `**Deployment URL:** ${parsed.href}\n\n`
      + "### Manual verification\n\n"
      + "1. Login as `joshua@directlendingconnection.com` (case-insensitive username).\n"
      + "2. Pipeline, tasks, lenders, contacts, settings — no permission or functionReference errors.\n"
      + "3. `AUTH_BRIDGE_SECRET`: same value on Vercel and Convex (≥24 chars).\n\n"
      + mdJsonBlock("mutation steps", steps)
      + mdJsonBlock("post-migration integrityAudit", integrityPost)
      + mdJsonBlock("post-migration planAccountOwnershipMigration", planPost)
      + mdJsonBlock("post-migration validateOrganizationIntegrity (sampled)", orgPost),
    "utf8",
  );
  console.error("Wrote", postPath);
  console.log(JSON.stringify({ ok: true, canonicalAuthUserId, steps: steps.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
