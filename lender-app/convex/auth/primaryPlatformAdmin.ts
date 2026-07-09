/**
 * Canonical identity for the primary in-app administrator (internal auth).
 * Login/username key is lowercase trimmed email.
 */
import type { Doc } from "../_generated/dataModel";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";

/** Single source of truth for internal-auth login + `normalizedUsername` row. */
export const PRIMARY_PLATFORM_ADMIN_LOGIN_KEY = normalizeUsername(
  "joshua@directlendingconnection.com",
);

const ALIAS_EMAILS_NORMALIZED = [
  PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
  normalizeAuthEmail("Joshua@DirectLendingConnection.com")!,
  normalizeAuthEmail("joshuaeballard@gmail.com")!,
  /** Common DNS typo — same human operator as the canonical primary admin. */
  normalizeAuthEmail("joshua@directlendingconection.com")!,
] as const;

const ALIAS_SET = new Set<string>(ALIAS_EMAILS_NORMALIZED);

export function primaryPlatformAdminUsernameKeys(): readonly string[] {
  return ALIAS_EMAILS_NORMALIZED;
}

/** Match authUsers row by login key or stored email (any historical casing). */
export function authUserIsPrimaryPlatformAdmin(
  u: Doc<"authUsers"> | null | undefined,
): boolean {
  if (!u) return false;
  if (ALIAS_SET.has(u.normalizedUsername)) return true;
  const em = normalizeAuthEmail(u.email);
  return Boolean(em && ALIAS_SET.has(em));
}
