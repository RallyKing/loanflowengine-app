/**
 * Merge duplicate native-auth rows for an email, purge sessions/tokens/lockout,
 * set password (Argon2 via app `hashPassword`), verify with loginLookup + verifyPassword.
 *
 * Env: DATA_MIGRATION_ADMIN_SECRET or ORG_INTEGRITY_ADMIN_SECRET (Convex),
 * NEXT_PUBLIC_CONVEX_URL, AUTH_BRIDGE_SECRET (≥24, same as Convex) for verification.
 *
 * Usage (from lender-app):
 *   npx tsx scripts/hard-reset-native-auth-email.ts
 *   npx tsx scripts/hard-reset-native-auth-email.ts joshua@directlendingconnection.com
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "../convex/_generated/api";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";
import { normalizeUsername } from "../lib/auth/normalizeUsername";
import { signBridge } from "../lib/auth/bridgeProof";
import { validatePlaintextPasswordPolicy } from "../lib/auth/passwordPolicy";
import { hashPassword, verifyPassword } from "../lib/security/argon2";
import {
  loadAdminSecret,
  loadConvexUrlRaw,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv";

const DEFAULT_EMAIL = "joshua@directlendingconnection.com";
const DEFAULT_PASSWORD = "simple@123";

function loadEnvLocalBridge(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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
  loadEnvLocalBridge();

  const adminSecret = loadAdminSecret();
  if (!adminSecret) {
    printMissingAdminSecretDiagnostics();
    process.exit(1);
  }

  const rawEmail =
    process.env.TARGET_EMAIL?.trim() ||
    process.argv.slice(2).find((a) => !a.startsWith("-"))?.trim() ||
    DEFAULT_EMAIL;

  const plain =
    process.env.NEW_PASSWORD?.trim() || DEFAULT_PASSWORD;
  const policyErr = validatePlaintextPasswordPolicy(plain);
  if (policyErr) {
    console.error(policyErr);
    process.exit(1);
  }

  const canonicalLogin = normalizeUsername(rawEmail);
  const parsed = parseConvexPublicUrl(loadConvexUrlRaw());
  if (!parsed.ok) {
    console.error("NEXT_PUBLIC_CONVEX_URL missing or invalid.");
    process.exit(1);
  }

  if ((process.env.AUTH_BRIDGE_SECRET?.trim().length ?? 0) < 24) {
    console.error(
      "AUTH_BRIDGE_SECRET must be ≥24 chars in .env.local (or shell) to verify loginLookup.",
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(plain);
  const localVerify = await verifyPassword(passwordHash, plain);
  if (!localVerify) {
    console.error("Local verifyPassword(newHash, plain) failed (unexpected).");
    process.exit(1);
  }

  const client = new ConvexHttpClient(parsed.href);

  /** 1) Collapse duplicate authUsers for this email / username-as-email. */
  const merged = await client.mutation(
    api.migrations.mergeAuthUsersByEmail.mergeAuthUsersByEmail,
    {
      adminSecret,
      email: rawEmail,
      matchUsernameAsEmail: true,
      dryRun: false,
    },
  );

  if (
    !merged.ok &&
    "reason" in merged &&
    merged.reason === "no_matching_auth_users"
  ) {
    console.error(
      "No authUsers match this email. Create the account first (e.g. signup or ensurePrimaryPlatformAdmin).",
    );
    process.exit(1);
  }

  if (!merged.ok) {
    console.error("mergeAuthUsersByEmail failed:", merged);
    process.exit(1);
  }

  const userId = merged.canonicalAuthUserId;

  const reset = await client.mutation(
    api.auth.operatorHardResetNativeAuth.hardResetAuthUserById,
    {
      adminSecret,
      userId,
      canonicalLoginKey: canonicalLogin,
      passwordHash,
    },
  );

  const normalizedForBridge = normalizeUsername(rawEmail);
  const bridge = signBridge(`login-lookup:${normalizedForBridge}`);
  const lookup = await client.query(api.auth.loginBridge.loginLookup, {
    username: rawEmail,
    bridgePayload: bridge.bridgePayload,
    bridgeProof: bridge.bridgeProof,
  });

  if (!lookup || lookup.found !== true) {
    console.error("loginLookup did not find user after reset (check canonical username).", {
      reset,
    });
    process.exit(1);
  }

  const loginVerify = await verifyPassword(lookup.passwordHash, plain);
  if (!loginVerify) {
    console.error(
      "verifyPassword failed on Convex-returned hash — login would reject this password.",
    );
    process.exit(1);
  }

  const payload = {
    ok: true,
    message:
      "Native auth reset complete: sessions and token rows removed, identity lowercased, Argon2 hash stored, loginLookup + verifyPassword succeeded.",
    email: reset.email,
    normalizedUsername: reset.normalizedUsername,
    userId: reset.userId,
    credentialVersion: reset.credentialVersion,
    mergeSummary: {
      reason: "reason" in merged ? merged.reason : undefined,
      canonicalAuthUserId: merged.canonicalAuthUserId,
      matchedCount:
        "matchedAuthUsers" in merged ? merged.matchedAuthUsers?.length : undefined,
    },
    purge: {
      sessionsDeleted: reset.sessionsDeleted,
      authPasswordResetTokensDeleted: reset.authPasswordResetTokensDeleted,
      authEmailVerificationTokensDeleted:
        reset.authEmailVerificationTokensDeleted,
    },
    loginVerification: { loginLookupFound: true, verifyPasswordOk: true },
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
