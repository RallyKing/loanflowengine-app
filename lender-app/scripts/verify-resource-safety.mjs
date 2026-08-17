#!/usr/bin/env node
/**
 * Resource & cost safety gate — static enforcement of
 * `docs/governance/resource-consumption-policy.md`.
 *
 * Exists because of the 2026-08-17 Convex overage (1.3M auto-archive sweep
 * calls, 637k analytics dashboard calls). Each check below maps to one clause
 * of that policy.
 *
 *   1. Cron floor          — no `crons.interval` under 15 minutes, no seconds.
 *   2. Query clock purity  — no Date.now()/new Date() inside query handlers.
 *   3. Polling ban         — no `refetchInterval`; `setInterval` allowlisted only.
 *   4. Stable query args   — no Date.now()/new Date() inside `useQuery(...)` args.
 *   5. Self-schedule pumps — a function scheduling itself via `scheduler.runAfter`.
 *   6. `.collect()` ratchet — new unbounded `.collect()` in convex/ fails.
 *
 * Checks 2 and 6 are ratchets: pre-existing debt is recorded in
 * `scripts/resource-safety-baseline.json` so the gate is green today and any
 * *new* violation fails the build.
 *
 * Escape hatch (must carry a reason):
 *   // resource-safety-allow: <reason + approver/doc link>
 * on the offending line or the line above it.
 *
 * After a green cost gate, this script invokes `verify-convex-reactivity.mjs`
 * (architectural layer — exhaustive-deps ratchet, cache-busters). That sibling
 * has its own baseline; do not merge the two.
 *
 * Usage:
 *   node scripts/verify-resource-safety.mjs
 *   node scripts/verify-resource-safety.mjs --update-baseline
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const BASELINE_PATH = path.join(appRoot, "scripts", "resource-safety-baseline.json");
const UPDATE_BASELINE = process.argv.includes("--update-baseline");

/** Minimum allowed `crons.interval` spacing. See policy section C. */
const CRON_MIN_MINUTES = 15;

const CLIENT_ROOTS = ["app", "components", "hooks", "lib"];
const BACKEND_ROOT = "convex";

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  "playwright-report",
  "test-results",
  "tests",
  "_generated",
]);

/**
 * `setInterval` timers that predate this policy. Each is either clock-only
 * (no Convex traffic) or a canonical throttled heartbeat. Do not extend this
 * list without an approved exception recorded in the policy doc.
 */
const SET_INTERVAL_ALLOWLIST = new Set([
  // Minute-bucket clock: setState only, feeds *stable* quantized query args.
  "components/providers/TriageClockProvider.tsx",
  // Tour spotlight rect measurement — DOM only, no Convex calls.
  "components/ProductTourOverlay.tsx",
  // Canonical presence heartbeat, hard-gated to 1 write/min in convexCostGovernance.
  "hooks/usePresence.ts",
  // Debug-only diagnostics sampler, off unless NEXT_PUBLIC_DEBUG_CONVEX_SUBS=1.
  "lib/convexSubDiagnostics.ts",
]);

/**
 * Self-scheduling jobs that provably terminate (work-remaining condition or
 * bounded retry budget). Idle pumps are never allowed here.
 */
const SELF_SCHEDULE_ALLOWLIST = new Set([
  // Continues only while unexported tables remain; ends at markComplete.
  "convex/dataBackup.ts::executeBackupPass",
  // Retry with backoff, capped by maxAttempts.
  "convex/webhookDispatcher.ts::dispatchWebhook",
]);

function relPosix(file) {
  return path.relative(appRoot, file).split(path.sep).join("/");
}

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR_NAMES.has(ent.name)) continue;
      if (ent.name.startsWith(".")) continue;
      yield* walk(p);
    } else if (/\.tsx?$/.test(ent.name)) {
      yield p;
    }
  }
}

/** Blanks comments and string bodies while preserving offsets and newlines. */
function blankNonCode(src) {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
    }
  };
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      let j = i + 2;
      while (j < n && src[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && next === "*") {
      let j = i + 2;
      while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
      blank(i, Math.min(j + 2, n));
      i = j + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === quote) break;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("");
}

function lineAt(src, index) {
  return src.slice(0, index).split(/\r?\n/).length;
}

/** True when the line (or the one above) carries the documented escape hatch. */
function isAllowedAt(lines, lineNumber) {
  const here = lines[lineNumber - 1] ?? "";
  const above = lines[lineNumber - 2] ?? "";
  return /resource-safety-allow\s*:/.test(here) || /resource-safety-allow\s*:/.test(above);
}

/** Index of the character after the block opened at `openIndex`. */
function matchDelimiter(code, openIndex, open, close) {
  let depth = 0;
  for (let i = openIndex; i < code.length; i++) {
    if (code[i] === open) depth++;
    else if (code[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const problems = [];

function report(rel, line, message) {
  problems.push(`${rel}:${line} ${message}`);
}

// ---------------------------------------------------------------------------
// 1. Cron interval floor
// ---------------------------------------------------------------------------
function checkCrons() {
  const rel = "convex/crons.ts";
  const file = path.join(appRoot, rel);
  if (!fs.existsSync(file)) return;
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  const code = blankNonCode(src);

  for (const m of code.matchAll(/crons\.interval\s*\(/g)) {
    const openParen = code.indexOf("(", m.index);
    const closeParen = matchDelimiter(code, openParen, "(", ")");
    if (closeParen < 0) continue;
    const argText = code.slice(openParen, closeParen);
    const line = lineAt(src, m.index);
    if (isAllowedAt(lines, line)) continue;

    if (/\bseconds\s*:/.test(argText)) {
      report(rel, line, "crons.interval with `seconds` is banned — minimum spacing is 15 minutes.");
      continue;
    }
    const minutes = argText.match(/\bminutes\s*:\s*([0-9_]+)/);
    if (minutes) {
      const value = Number(minutes[1].replace(/_/g, ""));
      if (Number.isFinite(value) && value < CRON_MIN_MINUTES) {
        report(
          rel,
          line,
          `crons.interval every ${value}m is below the ${CRON_MIN_MINUTES}m floor — empty ticks are billed function calls.`,
        );
      }
    }
  }
}

/**
 * Every `export const NAME = wrapper({ ... })` in a Convex module, with the
 * source offsets of its object body.
 *
 * @returns {Array<{ name: string, wrapper: string, start: number, end: number }>}
 */
function exportedConvexBlocks(code) {
  const blocks = [];
  const pattern = /export\s+const\s+(\w+)\s*=\s*(\w+)\s*\(\s*\{/g;
  for (const m of code.matchAll(pattern)) {
    const openBrace = code.indexOf("{", m.index + m[0].length - 1);
    const closeBrace = matchDelimiter(code, openBrace, "{", "}");
    if (closeBrace < 0) continue;
    blocks.push({
      name: m[1],
      wrapper: m[2],
      start: openBrace,
      end: closeBrace,
    });
  }
  return blocks;
}

function enclosingBlockName(blocks, index) {
  let best = null;
  for (const b of blocks) {
    if (index < b.start || index > b.end) continue;
    if (!best || b.start > best.start) best = b;
  }
  return best?.name ?? null;
}

// ---------------------------------------------------------------------------
// 2. No wall-clock reads inside query handlers (breaks Convex query caching)
// ---------------------------------------------------------------------------
const queryClockFindings = [];

function checkQueryClockPurity(rel, src, code, lines, blocks) {
  for (const block of blocks) {
    if (block.wrapper !== "query" && block.wrapper !== "internalQuery") continue;
    const body = code.slice(block.start, block.end);
    let flagged = false;
    for (const hit of body.matchAll(/\bDate\.now\s*\(|\bnew\s+Date\s*\(/g)) {
      if (flagged) break;
      const line = lineAt(src, block.start + hit.index);
      if (isAllowedAt(lines, line)) continue;
      flagged = true;
      queryClockFindings.push({
        rel,
        fn: block.name,
        wrapper: block.wrapper,
        line,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Self-scheduling pumps (a function re-scheduling *itself*)
// ---------------------------------------------------------------------------
function checkSelfSchedule(rel, src, code, lines, blocks) {
  const moduleDots = rel
    .replace(/^convex\//, "")
    .replace(/\.tsx?$/, "")
    .split("/")
    .join(".");

  const target = new RegExp(
    `scheduler\\.run(?:After|At)\\s*\\([^,]*,\\s*internal\\.${moduleDots.replace(
      /\./g,
      "\\.",
    )}\\.(\\w+)`,
    "g",
  );
  for (const m of code.matchAll(target)) {
    const fn = m[1];
    if (enclosingBlockName(blocks, m.index) !== fn) continue;
    const key = `${rel}::${fn}`;
    if (SELF_SCHEDULE_ALLOWLIST.has(key)) continue;
    const line = lineAt(src, m.index);
    if (isAllowedAt(lines, line)) continue;
    report(
      rel,
      line,
      `\`${fn}\` re-schedules itself — allowed only with a proven work-remaining or bounded-retry stop condition, never an idle pump (see pipelineAutoArchiveSweep incident). Document it and add it to SELF_SCHEDULE_ALLOWLIST.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3 + 4. Client polling and unstable query args
// ---------------------------------------------------------------------------
function checkClientFile(rel, src, code, lines) {
  for (const m of code.matchAll(/\brefetchInterval\b/g)) {
    const line = lineAt(src, m.index);
    if (isAllowedAt(lines, line)) continue;
    report(rel, line, "`refetchInterval` is banned — Convex `useQuery` is already reactive.");
  }

  for (const m of code.matchAll(/\bsetInterval\s*\(/g)) {
    const line = lineAt(src, m.index);
    if (SET_INTERVAL_ALLOWLIST.has(rel)) continue;
    if (isAllowedAt(lines, line)) continue;
    report(
      rel,
      line,
      "`setInterval` is banned in client code — no polling/refresh timers against Convex. Use reactive `useQuery` or an explicit user action.",
    );
  }

  for (const m of code.matchAll(/\buseQuery\s*\(/g)) {
    const openParen = code.indexOf("(", m.index);
    const closeParen = matchDelimiter(code, openParen, "(", ")");
    if (closeParen < 0) continue;
    const args = code.slice(openParen, closeParen);
    for (const hit of args.matchAll(/\bDate\.now\s*\(|\bnew\s+Date\s*\(/g)) {
      const line = lineAt(src, openParen + hit.index);
      if (isAllowedAt(lines, line)) continue;
      report(
        rel,
        line,
        "`useQuery` args read the wall clock — every render produces new args and re-subscribes. Pass a quantized clock from a stable provider (see TriageClockProvider).",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 6. `.collect()` ratchet
// ---------------------------------------------------------------------------
/** Counts `.collect()` calls not annotated as bounded. */
function countUnboundedCollects(src, code, lines) {
  let count = 0;
  for (const m of code.matchAll(/\.collect\s*\(\s*\)/g)) {
    const line = lineAt(src, m.index);
    const here = lines[line - 1] ?? "";
    const above = lines[line - 2] ?? "";
    if (/bounded\s*:/i.test(here) || /bounded\s*:/i.test(above)) continue;
    if (isAllowedAt(lines, line)) continue;
    count++;
  }
  return count;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { unboundedCollectsByFile: {}, knownQueryClockDebt: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
    return {
      unboundedCollectsByFile: parsed.unboundedCollectsByFile ?? {},
      knownQueryClockDebt: parsed.knownQueryClockDebt ?? {},
    };
  } catch {
    return { unboundedCollectsByFile: {}, knownQueryClockDebt: {} };
  }
}

function writeBaseline(collects, clockDebt) {
  const sortObj = (o) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const payload = {
    description:
      "Ratchet baselines for docs/governance/resource-consumption-policy.md. `knownQueryClockDebt` = queries that still read Date.now() (migrate to a time arg; never add more). `unboundedCollectsByFile` = existing unannotated .collect() counts; new ones must use .paginate()/.take(N) or carry a `// bounded: <why>` comment.",
    regenerate: "node scripts/verify-resource-safety.mjs --update-baseline",
    policy: "docs/governance/resource-consumption-policy.md",
    knownQueryClockDebt: sortObj(
      Object.fromEntries(
        Object.entries(clockDebt).map(([k, v]) => [k, [...v].sort()]),
      ),
    ),
    unboundedCollectsByFile: sortObj(collects),
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const clockCount = Object.values(payload.knownQueryClockDebt).reduce(
    (a, b) => a + b.length,
    0,
  );
  const collectCount = Object.values(payload.unboundedCollectsByFile).reduce(
    (a, b) => a + b,
    0,
  );
  console.log(
    `[verify-resource-safety] Baseline written: ${clockCount} query clock debts, ` +
      `${collectCount} unannotated .collect() calls in ${Object.keys(payload.unboundedCollectsByFile).length} files.`,
  );
}

function main() {
  const baseline = loadBaseline();
  const currentCollects = {};

  checkCrons();

  for (const root of [BACKEND_ROOT, ...CLIENT_ROOTS]) {
    const dir = path.join(appRoot, root);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const rel = relPosix(file);
      let src;
      try {
        src = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const code = blankNonCode(src);
      const lines = src.split(/\r?\n/);

      if (rel.startsWith(`${BACKEND_ROOT}/`)) {
        const blocks = exportedConvexBlocks(code);
        checkQueryClockPurity(rel, src, code, lines, blocks);
        checkSelfSchedule(rel, src, code, lines, blocks);
        const n = countUnboundedCollects(src, code, lines);
        if (n > 0) currentCollects[rel] = n;
      } else {
        checkClientFile(rel, src, code, lines);
      }
    }
  }

  const clockDebt = {};
  for (const f of queryClockFindings) {
    (clockDebt[f.rel] ??= new Set()).add(f.fn);
  }

  if (UPDATE_BASELINE) {
    writeBaseline(currentCollects, clockDebt);
    return;
  }

  for (const f of queryClockFindings) {
    const known = baseline.knownQueryClockDebt[f.rel] ?? [];
    if (known.includes(f.fn)) continue;
    report(
      f.rel,
      f.line,
      `${f.wrapper} \`${f.fn}\` reads the wall clock — pass time in as an arg. Date.now() inside a query defeats Convex caching and re-runs on every subscriber (see analytics.dashboard: 637k calls).`,
    );
  }

  for (const [rel, count] of Object.entries(currentCollects)) {
    const allowed = baseline.unboundedCollectsByFile[rel] ?? 0;
    if (count > allowed) {
      report(
        rel,
        1,
        `added ${count - allowed} unbounded \`.collect()\` call(s) (baseline ${allowed}). ` +
          "Use `.paginate(paginationOptsValidator)` or `.take(N)` on an index, or annotate the provable bound with `// bounded: <why>`.",
      );
    }
  }

  if (problems.length) {
    console.error(
      "[verify-resource-safety] FAILED — see docs/governance/resource-consumption-policy.md\n- " +
        problems.join("\n- "),
    );
    process.exit(1);
  }
  console.log(
    "[verify-resource-safety] OK — cron floor, query clock purity, no polling, stable query args, no idle self-schedule pumps, .collect() ratchet.",
  );

  const sibling = path.join(__dirname, "verify-convex-reactivity.mjs");
  if (fs.existsSync(sibling)) {
    const result = spawnSync(process.execPath, [sibling], { stdio: "inherit" });
    if (result.status) process.exit(result.status);
  }
}

main();
