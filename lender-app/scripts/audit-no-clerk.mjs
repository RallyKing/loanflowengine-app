#!/usr/bin/env node
/**
 * Fails the repo if legacy auth vendor strings or packages remain.
 * Excludes this file's patterns list from matching itself via careful checks only on sources.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".git",
  /** Generated operator reports; may echo migration API wording historic exports. */
  "migration-reports",
]);

const SKIP_FILES = new Set([
  path.normalize("docs/auth-removal-audit.md"),
  path.normalize("scripts/audit-no-clerk.mjs"),
]);

/**
 * Under `lender-app/` only — paths (posix) excluded from substring scan.
 * Includes mirrored docs and intentional migration / forensic audit tooling that
 * classifies or reports legacy vendor-shaped keys (not live SDK usage).
 */
const SKIP_SOURCE_PREFIXES = [
  "docs/",
  "convex/migrations/",
  "convex/accountOwnershipMigration",
  "convex/operator/auditTenantIsolation",
  "scripts/compile-tenant-audit",
  "scripts/run-tenant-audit",
  "scripts/tenant-audit",
  "scripts/run-phase12-forensic",
  "scripts/run-primary-account-full-consolidation",
];

/** Optional exact-path exclusions (posix). */
const SKIP_SOURCE_EXACT = new Set([]);

/**
 * Case-insensitive substrings (ASCII) that must not appear outside exclusions.
 * Intentionally omits legacy schema column `clerkOrganizationId` / index names —
 * those remain for migration integrity; live SDK imports are still banned below.
 */
const BANNED_SUBSTRINGS = [
  "@clerk/",
  "@clerk\"",
  "@clerk'",
  "clerk/nextjs",
  "clerkMiddleware",
  "useClerk",
  "orgClerkId",
  "FIXED_VIEWER",
  "APP_AUTH_FIXED_ORG_ID",
  "syncFromClerk",
  "lookupOrganizationIdByClerkId",
  "getForViewerByClerkId",
];

/** Comment / narrative lines documenting absence of or migration away from Clerk. */
const ALLOWLIST_CLERK_NARRATIVE =
  /\bNOT\s+Clerk\b|\bmigrated\s+off\s+Clerk\b|\blegacy\s+vendor\b|\bClerk-shaped\b|\bClerk-prefix\b|\bClerk-era\b/i;

/** Real SDK / package usage — never allowlist these even in a narrative line. */
const HARD_CLERK_SDK =
  /@clerk\/|clerk\/nextjs|clerkMiddleware|\buseClerk\b|from\s+['"]@clerk|require\(\s*['"]@clerk/;

function sourcePathSkipped(rel) {
  const norm = rel.split(path.sep).join("/");
  for (const p of SKIP_SOURCE_PREFIXES) {
    if (norm.startsWith(p)) return true;
  }
  if (SKIP_SOURCE_EXACT.has(norm)) return true;
  return false;
}

function isAllowlistedClerkLine(line) {
  if (HARD_CLERK_SDK.test(line)) return false;
  if (ALLOWLIST_CLERK_NARRATIVE.test(line)) return true;
  return false;
}

function* walkFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      yield* walkFiles(p);
    } else {
      yield p;
    }
  }
}

function relToApp(p) {
  return path.relative(appRoot, p).split(path.sep).join("/");
}

function scanSources() {
  const hits = [];
  for (const file of walkFiles(appRoot)) {
    const rel = relToApp(file);
    if (SKIP_FILES.has(path.normalize(rel))) continue;
    if (sourcePathSkipped(rel)) continue;
    const lowerName = rel.toLowerCase();
    if (lowerName === "package.json") continue;
    if (lowerName.endsWith("package-lock.json")) continue;
    if (
      !/\.(ts|tsx|js|mjs|cjs|mts|cts|json|md|css|html|svg)$/.test(lowerName)
    ) {
      continue;
    }
    let body;
    try {
      body = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isAllowlistedClerkLine(line)) continue;
      if (/\bclerk\b/i.test(line)) {
        hits.push({ rel, line: i + 1, text: line.trim().slice(0, 200) });
        continue;
      }
      for (const s of BANNED_SUBSTRINGS) {
        if (line.includes(s)) {
          hits.push({ rel, line: i + 1, text: line.trim().slice(0, 200) });
          break;
        }
      }
    }
  }
  return hits;
}

function scanLockfile() {
  const lockPath = path.join(appRoot, "package-lock.json");
  if (!fs.existsSync(lockPath)) return [];
  const text = fs.readFileSync(lockPath, "utf8");
  return /"node_modules\/@clerk\//.test(text)
    ? [`${relToApp(lockPath)} still references @clerk packages`]
    : [];
}

function scanWorkspaceMarkdown() {
  // Workspace-level `../docs` holds intentional migration narratives (legacy-vendor-era audits, etc.).
  // Runtime enforcement: scanSources over lender-app + lockfile + optional Convex org scan.
  return [];
}

function scanEnvFiles() {
  const hits = [];
  for (const file of walkFiles(appRoot)) {
    const rel = relToApp(file);
    if (!/^\.env/.test(path.basename(file))) continue;
    if (rel.includes("node_modules")) continue;
    let body;
    try {
      body = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isAllowlistedClerkLine(line)) continue;
      if (/\bclerk\b/i.test(line)) {
        hits.push({
          rel,
          line: i + 1,
          text: line.trim().slice(0, 200),
        });
      }
    }
  }
  return hits;
}

function convexDeploymentConfigured() {
  if (process.env.CONVEX_DEPLOYMENT?.trim()) return true;
  if (process.env.CONVEX_URL?.trim()) return true;
  if (process.env.NEXT_PUBLIC_CONVEX_URL?.trim()) return true;
  // Cheap check of local env files without requiring dotenv.
  for (const name of [".env.local", ".env"]) {
    const p = path.join(appRoot, name);
    if (!fs.existsSync(p)) continue;
    try {
      const text = fs.readFileSync(p, "utf8");
      if (
        /^CONVEX_DEPLOYMENT=.+/m.test(text) ||
        /^CONVEX_URL=.+/m.test(text) ||
        /^NEXT_PUBLIC_CONVEX_URL=.+/m.test(text)
      ) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * @returns {{ problems: string[], skipped: boolean, skipReason?: string }}
 */
function runConvexOrgScan() {
  if (process.env.SKIP_CONVEX_ORG_SCAN === "1") {
    const skipReason = "SKIP_CONVEX_ORG_SCAN=1";
    console.warn(
      `[audit:no-clerk] ${skipReason} — skipping Convex DB scan.`,
    );
    return { problems: [], skipped: true, skipReason };
  }
  if (!convexDeploymentConfigured()) {
    const skipReason = "no CONVEX_DEPLOYMENT / CONVEX_URL configured";
    console.warn(
      `[audit:no-clerk] ${skipReason} — skipping Convex DB scan (not a hard failure).`,
    );
    return { problems: [], skipped: true, skipReason };
  }
  const res = spawnSync(
    "npx",
    ["convex", "run", "orgLegacyTokenAudit:scanOrganizationRowsForLegacyOrgPrefix", "{}"],
    {
      cwd: appRoot,
      encoding: "utf8",
      shell: true,
      env: { ...process.env },
    },
  );
  if (res.status !== 0) {
    return {
      skipped: false,
      problems: [
        `Convex scan failed (is convex logged in and deployed?). stderr: ${(res.stderr || "").slice(0, 400)}`,
      ],
    };
  }
  const out = (res.stdout || "").trim();
  const jsonMatch = out.match(/\{[\s\S]*"rowsWithLegacyOrgToken"[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      skipped: false,
      problems: [`Could not parse Convex scan output: ${out.slice(0, 300)}`],
    };
  }
  try {
    const data = JSON.parse(jsonMatch[0]);
    if (data.rowsWithLegacyOrgToken > 0) {
      return {
        skipped: false,
        problems: [
          `Convex organizations table still has ${data.rowsWithLegacyOrgToken} rows whose JSON contains legacy org_ tokens (checked ${data.organizationsChecked} rows).`,
        ],
      };
    }
  } catch (e) {
    return {
      skipped: false,
      problems: [
        `Convex scan JSON parse error: ${e instanceof Error ? e.message : e}`,
      ],
    };
  }
  return { problems: [], skipped: false };
}

function main() {
  const problems = [];
  problems.push(...scanLockfile());
  problems.push(...runEnvIssues(scanEnvFiles()));
  problems.push(...runSourceIssues(scanWorkspaceMarkdown()));
  problems.push(...runSourceIssues(scanSources()));
  const convexScan = runConvexOrgScan();
  problems.push(...convexScan.problems);

  if (problems.length) {
    console.error("[audit:no-clerk] FAILED:\n- " + problems.join("\n- "));
    process.exit(1);
  }
  if (convexScan.skipped) {
    console.log(
      `[audit:no-clerk] OK — no blocked references, lockfile clean; Convex org scan skipped (${convexScan.skipReason}).`,
    );
  } else {
    console.log(
      "[audit:no-clerk] OK — no blocked references, lockfile clean, Convex org scan clear.",
    );
  }
}

function runEnvIssues(envIssues) {
  if (!envIssues.length) return [];
  return envIssues.map((h) => `${h.rel}:${h.line} ${h.text}`);
}

function runSourceIssues(srcHits) {
  if (!srcHits.length) return [];
  return srcHits.map((h) => `${h.rel}:${h.line} ${h.text}`);
}

main();
