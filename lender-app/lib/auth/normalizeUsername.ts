/**
 * Canonical auth username **index key**: Unicode NFKC, `trim`, `toLowerCase`.
 *
 * **Never** pass `args.username` / request body strings directly to
 * `q.eq("normalizedUsername", …)`. Always:
 * `const usernameLower = normalizeUsername(raw); … q.eq("normalizedUsername", usernameLower)`.
 */
export function normalizeUsername(raw: string): string {
  const s = typeof raw === "string" ? raw : "";
  try {
    return s.normalize("NFKC").trim().toLowerCase();
  } catch {
    return s.trim().toLowerCase();
  }
}
