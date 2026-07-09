import { normalizeUsername } from "./normalizeUsername";

/**
 * Seeded Playwright / QA identities use `@dlc.test`. They must not accumulate
 * failed-login strikes toward the same lockout path as real customers.
 */
export function isE2ESandboxNormalizedUsername(normalizedUsername: string): boolean {
  return normalizedUsername.endsWith("@dlc.test");
}

export function isE2ESandboxLoginEmail(raw: string): boolean {
  return isE2ESandboxNormalizedUsername(normalizeUsername(raw));
}
