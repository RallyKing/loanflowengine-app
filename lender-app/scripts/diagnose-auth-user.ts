/**
 * Operator: diagnose production native auth row + verify probe password locally.
 *
 * Usage:
 *   npx tsx scripts/diagnose-auth-user.ts joshua@directlendingconnection.com
 *   PROBE_PASSWORD='simple@123' npx tsx scripts/diagnose-auth-user.ts user@example.com
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";
import { verifyPassword } from "../lib/security/argon2";
import {
  loadAdminSecret,
  loadConvexUrlPreferProd,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv";

export type AuthUserDiagnosticReport = {
  userExists: boolean;
  usernameStored: string | null;
  normalizedUsernameStored: string;
  emailStored: string | null;
  passwordHashPresent: boolean;
  argon2HashFormatValid: boolean;
  hashValidatesAgainstProbe: boolean;
  membershipActive: boolean;
  defaultOrgValid: boolean;
  probePassword: string;
  raw: unknown;
};

export async function runAuthUserDiagnostic(
  loginOrEmail: string,
  probePassword: string,
): Promise<AuthUserDiagnosticReport> {
  const adminSecret = loadAdminSecret();
  if (!adminSecret) {
    printMissingAdminSecretDiagnostics();
    throw new Error("Missing DATA_MIGRATION_ADMIN_SECRET");
  }

  const parsed = parseConvexPublicUrl(loadConvexUrlPreferProd());
  if (!parsed.ok) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL missing or invalid.");
  }

  const client = new ConvexHttpClient(parsed.href);
  const raw = await client.mutation(
    api.auth.operatorDiagnose.diagnoseAuthUserByLogin,
    { adminSecret, loginOrEmail },
  );

  let hashValidatesAgainstProbe = false;
  if (
    raw &&
    typeof raw === "object" &&
    "passwordHashForVerify" in raw &&
    typeof (raw as { passwordHashForVerify?: string | null }).passwordHashForVerify ===
      "string"
  ) {
    const hash = (raw as { passwordHashForVerify: string }).passwordHashForVerify;
    hashValidatesAgainstProbe = await verifyPassword(hash, probePassword);
  }

  const row = raw as {
    userExists?: boolean;
    usernameStored?: string | null;
    normalizedUsernameStored?: string;
    emailStored?: string | null;
    passwordHashPresent?: boolean;
    argon2HashFormatValid?: boolean;
    membershipActive?: boolean;
    defaultOrgValid?: boolean;
  };

  return {
    userExists: Boolean(row.userExists),
    usernameStored: row.usernameStored ?? null,
    normalizedUsernameStored: row.normalizedUsernameStored ?? "",
    emailStored: row.emailStored ?? null,
    passwordHashPresent: Boolean(row.passwordHashPresent),
    argon2HashFormatValid: Boolean(row.argon2HashFormatValid),
    hashValidatesAgainstProbe,
    membershipActive: Boolean(row.membershipActive),
    defaultOrgValid: Boolean(row.defaultOrgValid),
    probePassword,
    raw,
  };
}

async function main() {
  const login =
    process.env.TARGET_USERNAME?.trim() ||
    process.argv.slice(2).find((a) => !a.startsWith("-"))?.trim() ||
    "joshua@directlendingconnection.com";
  const probe = process.env.PROBE_PASSWORD?.trim() || "simple@123";

  const report = await runAuthUserDiagnostic(login, probe);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
