import { normalizeAuthEmail } from "./normalizeAuthEmail";
import { normalizeUsername } from "./normalizeUsername";

/** Canonical user-facing label (NFKC email/login lowercase). */
export function canonicalDisplayUsername(
  raw: string | undefined | null,
): string {
  if (raw == null) return "";
  let t = raw.trim();
  if (!t) return "";
  try {
    t = t.normalize("NFKC");
  } catch {
    /* ignore */
  }
  if (t.includes("@")) {
    return normalizeAuthEmail(t) ?? t.toLowerCase();
  }
  return normalizeUsername(t);
}

/** Fallback when only an opaque userKey is known (never show full Convex id in UI). */
export function opaqueUserKeyFallback(userKey: string): string {
  const k = userKey.trim();
  if (!k) return "";
  if (k.includes("@")) return canonicalDisplayUsername(k);
  if (k.length > 14) return `${k.slice(0, 12)}…`;
  return k;
}
