/**
 * One-shot operator: canonical primary platform admin (joshua@directlendingconnection.com),
 * password, merge known alias auth accounts into that user, normalize casing.
 *
 * Requires DATA_MIGRATION_ADMIN_SECRET (or ORG_INTEGRITY_ADMIN_SECRET) matching Convex,
 * and NEXT_PUBLIC_CONVEX_URL — see scripts/lib/migrationOperatorEnv.ts
 *
 * Usage:
 *   NEW_PASSWORD='simple@123' npm run admin:ensure-primary
 *
 * Secondary emails merged must match convex/auth/primaryPlatformAdmin.ts (excluding canonical).
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";
import { normalizeUsername } from "../lib/auth/normalizeUsername";
import { validatePlaintextPasswordPolicy } from "../lib/auth/passwordPolicy";
import { hashPassword } from "../lib/security/argon2";
import {
  loadAdminSecret,
  loadConvexUrlPreferProd,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv";

/** Aligned with `primaryPlatformAdmin` aliases — canonical joshua@… excluded. */
const SECONDARY_AUTH_EMAILS_TO_MERGE = ["joshuaeballard@gmail.com"] as const;

const PRIMARY_LOGIN = normalizeUsername("joshua@directlendingconnection.com");

async function main() {
  const adminSecret = loadAdminSecret();
  if (!adminSecret) {
    printMissingAdminSecretDiagnostics();
    process.exit(1);
  }

  const parsed = parseConvexPublicUrl(loadConvexUrlPreferProd());
  if (!parsed.ok) {
    console.error("NEXT_PUBLIC_CONVEX_URL missing or invalid.");
    process.exit(1);
  }

  let plain =
    process.env.NEW_PASSWORD?.trim() ||
    process.argv.slice(2).find((a) => !a.startsWith("-"))?.trim() ||
    "";
  if (!plain) {
    plain = "simple@123";
    console.warn(
      "NEW_PASSWORD not set — using default (set NEW_PASSWORD for a different password).",
    );
  }
  const policyErr = validatePlaintextPasswordPolicy(plain);
  if (policyErr) {
    console.error(policyErr);
    process.exit(1);
  }

  const passwordHash = await hashPassword(plain);
  const client = new ConvexHttpClient(parsed.href);

  console.error("Step 1/4: auth/globalAdminBootstrap:ensurePrimaryPlatformAdmin …");
  const ensured = await client.mutation(
    api.auth.globalAdminBootstrap.ensurePrimaryPlatformAdmin,
    {
      adminSecret,
      passwordHashForCreate: passwordHash,
      passwordHashForUpdate: passwordHash,
    },
  );
  console.error(JSON.stringify({ step: "ensurePrimaryPlatformAdmin", ensured }, null, 2));

  console.error("Step 2/4: auth/globalAdminBootstrap:apply …");
  const applied = await client.mutation(api.auth.globalAdminBootstrap.apply, {
    adminSecret,
  });
  console.error(JSON.stringify({ step: "apply", applied }, null, 2));

  const canonicalId = ensured.userId;

  for (const email of SECONDARY_AUTH_EMAILS_TO_MERGE) {
    console.error(`Step 3/4: mergeAuthUsersByEmail (${email}) …`);
    const merged = await client.mutation(
      api.migrations.mergeAuthUsersByEmail.mergeAuthUsersByEmail,
      {
        adminSecret,
        email,
        canonicalAuthUserId: canonicalId,
        dryRun: false,
        matchUsernameAsEmail: true,
      },
    );
    console.error(JSON.stringify({ step: "mergeAuthUsersByEmail", email, merged }, null, 2));
  }

  console.error("Step 4/4: normalizeAuthUserCasing …");
  const normalized = await client.mutation(
    api.migrations.normalizeAuthUserCasing.normalizeAuthUserCasing,
    {
      adminSecret,
      dryRun: false,
    },
  );
  console.error(JSON.stringify({ step: "normalizeAuthUserCasing", normalized }, null, 2));

  if (!normalized.ok) {
    console.error(
      "normalizeAuthUserCasing failed — resolve conflicts (payload above), then re-run.",
    );
    process.exit(1);
  }

  console.error(
    JSON.stringify(
      {
        ok: true,
        primaryLogin: PRIMARY_LOGIN,
        canonicalAuthUserId: canonicalId,
        mergedAliasEmails: [...SECONDARY_AUTH_EMAILS_TO_MERGE],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
