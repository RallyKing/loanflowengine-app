/**
 * Full ownership consolidation for the primary platform admin identity
 * (joshua@directlendingconnection.com): ensure bootstrap, merge duplicate auth
 * users (canonical email + Gmail alias), normalize casing, purge legacy external
 * auth mappings from legacy external IdP-era rows.
 *
 * Env: loadAdminSecret() via scripts/lib/migrationOperatorEnv.ts
 * Convex URL: prefers `NEXT_PUBLIC_CONVEX_URL` from `.env.convex.prod` so a dev
 * URL in `.env.local` does not send this job to a dead local backend.
 *
 * Usage:
 *   npx tsx scripts/run-full-ownership-migration.ts
 *
 * If prod has no primary admin `authUsers` row yet, pass a bootstrap password (Argon2 hashed locally):
 *   NEW_PASSWORD='…' npx tsx scripts/run-full-ownership-migration.ts
 * or pass the plaintext as the first CLI argument.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";
import { validatePlaintextPasswordPolicy } from "../lib/auth/passwordPolicy";
import { hashPassword } from "../lib/security/argon2";
import {
  loadAdminSecret,
  loadConvexUrlRaw,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv";

const PRIMARY_EMAIL = "joshua@directlendingconnection.com";
const SECONDARY_EMAILS = ["joshuaeballard@gmail.com"] as const;

/** When the primary `authUsers` row does not exist yet, Convex requires Argon2 `passwordHashForCreate`. */
function resolveBootstrapPlainPassword(): string | undefined {
  const fromEnv = process.env.NEW_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  const fromArgv = process.argv.slice(2).find((a) => !a.startsWith("-"))?.trim();
  return fromArgv || undefined;
}

function flatOps(summary: Record<string, number>) {
  return Object.entries(summary)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([metric, count]) => ({ metric, count }))
    .sort((a, b) => a.metric.localeCompare(b.metric));
}

/** Hosted Convex URL from `.env.convex.prod`, else same resolution as other operator scripts. */
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

async function main() {
  const adminSecret = loadAdminSecret();
  if (!adminSecret) {
    printMissingAdminSecretDiagnostics();
    process.exit(1);
  }
  const parsed = parseConvexPublicUrl(convexUrlForOperator());
  if (!parsed.ok) {
    console.error("NEXT_PUBLIC_CONVEX_URL missing or invalid.");
    process.exit(1);
  }

  const client = new ConvexHttpClient(parsed.href);
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    target: PRIMARY_EMAIL,
    steps: [] as unknown[],
  };

  const bootstrapPlain = resolveBootstrapPlainPassword();
  let passwordHashForBootstrap: string | undefined;
  if (bootstrapPlain) {
    const policyErr = validatePlaintextPasswordPolicy(bootstrapPlain);
    if (policyErr) {
      console.error(policyErr);
      process.exit(1);
    }
    passwordHashForBootstrap = await hashPassword(bootstrapPlain);
  }

  console.error("Step 1/5: auth/globalAdminBootstrap.ensurePrimaryPlatformAdmin …");
  let ensured;
  const ensureArgs = {
    adminSecret,
    ...(passwordHashForBootstrap
      ? { passwordHashForCreate: passwordHashForBootstrap }
      : {}),
  };
  try {
    ensured = await client.mutation(
      api.auth.globalAdminBootstrap.ensurePrimaryPlatformAdmin,
      ensureArgs,
    );
  } catch (e) {
    const base =
      e instanceof Error ? { message: e.message, name: e.name } : { message: String(e) };
    const data = e instanceof ConvexError ? { convexData: e.data } : {};
    const needPw =
      e instanceof ConvexError &&
      typeof e.data === "object" &&
      e.data !== null &&
      "message" in e.data &&
      typeof (e.data as { message?: string }).message === "string" &&
      (e.data as { message: string }).message.includes("passwordHashForCreate");
    if (needPw) {
      console.error(
        JSON.stringify(
          {
            step: 1,
            fatal: true,
            ensurePrimaryPlatformAdmin_threw: { ...base, ...data },
            hint: "No primary admin authUsers row in this deployment. Re-run with NEW_PASSWORD set (or pass the password as the first CLI argument). Example: NEW_PASSWORD='your-password' npx tsx scripts/run-full-ownership-migration.ts",
          },
          null,
          2,
        ),
      );
    } else {
      console.error(
        JSON.stringify({ step: 1, fatal: true, ensurePrimaryPlatformAdmin_threw: { ...base, ...data } }, null, 2),
      );
    }
    process.exit(1);
  }
  (report.steps as unknown[]).push({
    step: 1,
    name: "ensurePrimaryPlatformAdmin",
    result: ensured,
  });
  if (!ensured.ok) {
    console.error(JSON.stringify({ fatal: true, ensured }, null, 2));
    process.exit(1);
  }

  const canonicalAuthUserId = ensured.userId as Id<"authUsers">;

  console.error("Step 1b: accountOwnershipMigration.planAccountOwnershipMigration …");
  const migrationPlan = await client.query(
    api.accountOwnershipMigration.planAccountOwnershipMigration,
    { adminSecret, email: PRIMARY_EMAIL },
  );
  (report.steps as unknown[]).push({
    step: "1b",
    name: "planAccountOwnershipMigration",
    result: migrationPlan,
  });
  const extraKeys =
    migrationPlan.ok === true &&
    Array.isArray(migrationPlan.suggestedAdditionalKeysToRekey)
      ? migrationPlan.suggestedAdditionalKeysToRekey
      : [];
  if (
    migrationPlan.ok === true &&
    migrationPlan.otherAuthKeysStillReferenced.length > 0
  ) {
    console.error(
      JSON.stringify(
        {
          warn: "other_auth_keys_still_referenced",
          keys: migrationPlan.otherAuthKeysStillReferenced,
          hint: "Merge those auth accounts by email (mergeAuthUsersByEmail) or remove stale references before expecting a clean audit.",
        },
        null,
        2,
      ),
    );
  }

  console.error("Step 2/5: mergeAuthUsersByEmail (dry run) …");
  const dryPrimary = await client.mutation(
    api.migrations.mergeAuthUsersByEmail.mergeAuthUsersByEmail,
    {
      adminSecret,
      email: PRIMARY_EMAIL,
      matchUsernameAsEmail: true,
      canonicalAuthUserId,
      ...(extraKeys.length > 0 ? { additionalKeysToRekey: extraKeys } : {}),
      dryRun: true,
    },
  );
  (report.steps as unknown[]).push({
    step: 2,
    name: "mergeAuthUsersByEmail_primary_dryRun",
    result: dryPrimary,
    operationsNonZero: flatOps(
      dryPrimary.ok && "recordsMovedByTable" in dryPrimary
        ? (dryPrimary as { recordsMovedByTable: Record<string, number> })
            .recordsMovedByTable
        : {},
    ),
  });

  console.error("Step 3/5: mergeAuthUsersByEmail (execute) primary …");
  const execPrimary = await client.mutation(
    api.migrations.mergeAuthUsersByEmail.mergeAuthUsersByEmail,
    {
      adminSecret,
      email: PRIMARY_EMAIL,
      matchUsernameAsEmail: true,
      canonicalAuthUserId,
      ...(extraKeys.length > 0 ? { additionalKeysToRekey: extraKeys } : {}),
      dryRun: false,
    },
  );
  (report.steps as unknown[]).push({
    step: 3,
    name: "mergeAuthUsersByEmail_primary_execute",
    result: execPrimary,
    operationsNonZero: flatOps(
      execPrimary.ok && "recordsMovedByTable" in execPrimary
        ? (execPrimary as { recordsMovedByTable: Record<string, number> })
            .recordsMovedByTable
        : {},
    ),
  });
  if (!execPrimary.ok) {
    console.error(JSON.stringify({ fatal: true, execPrimary }, null, 2));
    process.exit(1);
  }

  for (const email of SECONDARY_EMAILS) {
    console.error(`Step 3b: mergeAuthUsersByEmail (execute) ${email} …`);
    const merged = await client.mutation(
      api.migrations.mergeAuthUsersByEmail.mergeAuthUsersByEmail,
      {
        adminSecret,
        email,
        canonicalAuthUserId,
        matchUsernameAsEmail: true,
        dryRun: false,
      },
    );
    (report.steps as unknown[]).push({
      step: "3b",
      name: `mergeAuthUsersByEmail_${email}`,
      result: merged,
      operationsNonZero: flatOps(
        merged.ok && "recordsMovedByTable" in merged
          ? (merged as { recordsMovedByTable: Record<string, number> })
              .recordsMovedByTable
          : {},
      ),
    });
  }

  console.error("Step 4/5: normalizeAuthUserCasing …");
  const normalized = await client.mutation(
    api.migrations.normalizeAuthUserCasing.normalizeAuthUserCasing,
    { adminSecret, dryRun: false },
  );
  (report.steps as unknown[]).push({
    step: 4,
    name: "normalizeAuthUserCasing",
    result: normalized,
  });
  if (!normalized.ok) {
    console.error(
      JSON.stringify({ fatal: true, normalized }, null, 2),
    );
    process.exit(1);
  }

  console.error("Step 5/5: purgeLegacyExternalAuth …");
  const purged = await client.mutation(
    api.migrations.purgeLegacyExternalAuth.purgeLegacyExternalAuth,
    {
      adminSecret,
      dryRun: false,
    },
  );
  (report.steps as unknown[]).push({
    step: 5,
    name: "purgeLegacyExternalAuth",
    result: purged,
  });

  report.finishedAt = new Date().toISOString();
  report.summary = {
    canonicalAuthUserId,
    note: "Per-authUser records are in steps.*.result.matchedAuthUsers. Table touches are aggregate counts in recordsMovedByTable (merge returns counts, not per-row IDs).",
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
