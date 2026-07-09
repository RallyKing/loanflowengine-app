/**
 * Operator: set internal-auth password for one user (Argon2 via Convex mutation).
 *
 * Reads (first hit wins): .env.local → .env.convex.prod → .env, then process.env.
 * - NEXT_PUBLIC_CONVEX_URL
 * - DATA_MIGRATION_ADMIN_SECRET or ORG_INTEGRITY_ADMIN_SECRET (must match Convex)
 * - Optional: DATA_MIGRATION_ADMIN_SECRET_FILE=relative-or-absolute-path (file: first line = secret, gitignored)
 *
 * Note: APP_AUTH_* is separate dev HMAC login; it does **not** satisfy this script.
 *
 * Usage (do not commit passwords):
 *   TARGET_USERNAME=user@example.com NEW_PASSWORD='…' npx tsx scripts/reset-auth-user-password.ts
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";
import { validatePlaintextPasswordPolicy } from "../lib/auth/passwordPolicy";
import { hashPassword } from "../lib/security/argon2";
import {
  loadAdminSecret,
  loadConvexUrlRaw,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv";

async function main() {
  const username =
    process.env.TARGET_USERNAME?.trim() ||
    process.argv.slice(2).find((a) => !a.startsWith("-"))?.trim();
  const newPassword = process.env.NEW_PASSWORD ?? "";
  const adminSecret = loadAdminSecret();

  if (!username) {
    console.error("Set TARGET_USERNAME or pass username as first argument.");
    process.exit(1);
  }
  if (!newPassword) {
    console.error("Set NEW_PASSWORD (non-empty).");
    process.exit(1);
  }
  const policyErr = validatePlaintextPasswordPolicy(newPassword);
  if (policyErr) {
    console.error(policyErr);
    process.exit(1);
  }
  if (!adminSecret) {
    printMissingAdminSecretDiagnostics();
    process.exit(1);
  }

  const parsed = parseConvexPublicUrl(loadConvexUrlRaw());
  if (!parsed.ok) {
    console.error("NEXT_PUBLIC_CONVEX_URL missing or invalid.");
    process.exit(1);
  }

  const client = new ConvexHttpClient(parsed.href);
  const passwordHash = await hashPassword(newPassword);

  try {
    const out = await client.mutation(
      api.auth.migrationSetPassword.setAuthUserPassword,
      {
        adminSecret,
        username,
        passwordHash,
      },
    );
    console.log(
      JSON.stringify(
        {
          ok: out.ok,
          userId: out.userId,
          normalizedUsername: out.normalizedUsername,
          sessionsRevoked: out.sessionsRevoked,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("reset-auth-user-password failed:", msg);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
