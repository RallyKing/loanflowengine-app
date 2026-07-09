/**
 * Phase 12.2 Step 7 — superuser impersonation allowlist.
 * ONLY the canonical primary login may initiate impersonation.
 * No role-based fallback, no alias accounts, no env override.
 */
import type { Doc } from "../_generated/dataModel";
import { PRIMARY_PLATFORM_ADMIN_LOGIN_KEY } from "./primaryPlatformAdmin";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";

export { PRIMARY_PLATFORM_ADMIN_LOGIN_KEY as SUPERUSER_IMPERSONATION_LOGIN_KEY };

export function authUserMayInitiateSuperuserImpersonation(
  u: Doc<"authUsers"> | null | undefined,
): boolean {
  if (!u) return false;
  return normalizeUsername(u.normalizedUsername) === PRIMARY_PLATFORM_ADMIN_LOGIN_KEY;
}
