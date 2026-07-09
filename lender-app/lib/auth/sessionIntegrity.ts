/**
 * Internal auth sessions use `authUsers._id` as `userKey`. Values shaped like
 * legacy vendor ids break Convex RBAC lookups and should force re-login.
 *
 * Valid internal keys are lowercase alphanumerics plus underscore (matches
 * stable E2E catalog ids like `e2e_super_admin_v1` and typical Convex ids).
 */
const MIN_INTERNAL_USER_KEY_LEN = 10;
const MAX_INTERNAL_USER_KEY_LEN = 96;
const INTERNAL_USER_KEY_RE = /^[a-z0-9_]+$/;

export function isCorruptInternalAuthUserKey(
  userKey: string | null | undefined,
): boolean {
  if (userKey == null) return false;
  const k = userKey.trim();
  if (!k) return false;
  if (k.startsWith("user_") || k.startsWith("clerk_")) return true;
  if (
    k.length < MIN_INTERNAL_USER_KEY_LEN ||
    k.length > MAX_INTERNAL_USER_KEY_LEN ||
    !INTERNAL_USER_KEY_RE.test(k)
  ) {
    return true;
  }
  return false;
}
