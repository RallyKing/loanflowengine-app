/**
 * Offline micro-benchmarks for hot-path structures (no Convex).
 * Run: `npm run test:perf`
 *
 * Validates O(n) grouping behavior for ledger-style joins at coarse scale.
 */
import assert from "node:assert/strict";

function groupPaymentsByLedgerId<T extends { ledgerId: string }>(
  payments: readonly T[]
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const p of payments) {
    const cur = m.get(p.ledgerId);
    if (cur) cur.push(p);
    else m.set(p.ledgerId, [p]);
  }
  return m;
}

function filterTaskTitles(
  rows: Array<{ title: string }>,
  needle: string,
  cap: number,
): number {
  const n = needle.toLowerCase();
  let c = 0;
  for (const t of rows) {
    if (t.title.toLowerCase().includes(n)) {
      c++;
      if (c >= cap) break;
    }
  }
  return c;
}

const payments = Array.from({ length: 50_000 }, (_, i) => ({
  ledgerId: `L${i % 200}`,
  gross: 1,
  net: 1,
  date: i,
}));

const t0 = performance.now();
const g = groupPaymentsByLedgerId(payments);
const groupMs = performance.now() - t0;
assert(g.size === 200);
assert((g.get("L0")?.length ?? 0) === 250);

const tasks = Array.from({ length: 10_000 }, (_, i) => ({
  title: `Task ${i % 3 === 0 ? "alpha-findme" : "beta"}`,
}));
const t1 = performance.now();
const matchCount = filterTaskTitles(tasks, "findme", 12);
const filterMs = performance.now() - t1;
assert(matchCount === 12);

console.log(
  `perf: groupPaymentsByLedgerId(50k)=${groupMs.toFixed(1)}ms; scanTitles(10k)=${filterMs.toFixed(1)}ms`,
);
if (groupMs > 400 || filterMs > 400) {
  console.warn(
    "perf: unexpectedly slow — run on a loaded machine or investigate.",
  );
}
