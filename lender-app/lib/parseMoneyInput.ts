/**
 * Parse broker-friendly $ amounts in filter inputs: 500000, 500k, 1.5M, 250,000
 */
export function parseMoneyInput(s: string): number | undefined {
  const t = s.trim().replace(/[$,\s]/g, "");
  if (!t) return undefined;
  const lower = t.toLowerCase();
  const mSuffix = lower.match(
    /^(\d+(?:\.\d+)?)\s*([kmb])?$/i
  );
  if (mSuffix) {
    const n = parseFloat(mSuffix[1]);
    if (!Number.isFinite(n) || n < 0) return undefined;
    const suf = (mSuffix[2] || "").toLowerCase();
    if (suf === "k") return Math.round(n * 1_000);
    if (suf === "m" || suf === "b")
      return Math.round(n * 1_000_000) /* b also million for our data */;
  }
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  const r = Math.round(n);
  return Number.isFinite(r) ? r : undefined;
}
