/**
 * Single source of truth for **plaintext** password rules (internal auth, portal,
 * signup, reset, scripts). Enforce only here — do not duplicate min/max elsewhere.
 *
 * Stored passwords use Argon2id (native auth) or PBKDF2 (portal); see
 * `validateStoredArgon2PasswordHash` for Node `lib/security/argon2` blobs only.
 */
export const MIN_PLAINTEXT_PASSWORD_LENGTH = 6;
export const MAX_PLAINTEXT_PASSWORD_LENGTH = 128;

/**
 * Argon2id strings from `lib/security/argon2` `hashPassword()` are always longer
 * than this; used to reject garbage without parsing.
 */
export const MIN_ARGON2ID_ENCODED_HASH_LENGTH = 20;

const STORED_ARGON2_HASH_ERROR =
  "Invalid password hash (expected Argon2 string from Node hashPassword).";

/** `null` = valid plaintext; otherwise a safe message for JSON / thrown Error text. */
export function validatePlaintextPasswordPolicy(plain: string): string | null {
  const n = plain.length;
  if (n < MIN_PLAINTEXT_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PLAINTEXT_PASSWORD_LENGTH} characters.`;
  }
  if (n > MAX_PLAINTEXT_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PLAINTEXT_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/**
 * Validates an encoded Argon2 password string stored on `authUsers.passwordHash`.
 * `null` = ok; otherwise use the message in an Error or API response.
 */
export function validateStoredArgon2PasswordHash(hash: string): string | null {
  const t = hash.trim();
  if (t.length < MIN_ARGON2ID_ENCODED_HASH_LENGTH) {
    return STORED_ARGON2_HASH_ERROR;
  }
  return null;
}

export function plaintextPasswordRequirementSummary(): string {
  return `${MIN_PLAINTEXT_PASSWORD_LENGTH}–${MAX_PLAINTEXT_PASSWORD_LENGTH} characters`;
}