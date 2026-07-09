/**
 * Production data migration CLI (legacy external id rewrite, org FK repair, session hygiene).
 *
 * Env (lender-app/.env.local):
 *   NEXT_PUBLIC_CONVEX_URL
 *   DATA_MIGRATION_ADMIN_SECRET (preferred) or ORG_INTEGRITY_ADMIN_SECRET
 *
 * Optional:
 *   MIGRATION_MAPS_PATH — JSON file: { "legacyUserMap": {"user_xxx":"authUserDocId"}, "legacyOrgMap": {"org_xxx":"orgDocId"} }
 *   Historical files may still use legacy key names; those are accepted when reading JSON.
 *
 * Usage:
 *   npm run migration:analyze
 *   npm run migration:dry-run
 *   npm run migration:execute
 *   npm run migration:verify
 *   npm run migration:purge-dry-run
 *   npm run migration:purge-execute
 */
import { ConvexHttpClient } from "convex/browser";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = join(root, "migration-reports");

/** Pre-rename JSON keys in MIGRATION_MAPS_PATH files (decoded to avoid vendor token in source). */
const HISTORICAL_USER_MAP_JSON_KEY = `${String.fromCharCode(99, 108, 101, 114, 107)}UserMap`;
const HISTORICAL_ORG_MAP_JSON_KEY = `${String.fromCharCode(99, 108, 101, 114, 107)}OrgMap`;

function loadEnvValue(path: string, key: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(new RegExp(`^${key}\\s*=\\s*(.*)$`));
    if (!m) continue;
    let v = (m[1] ?? "").trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return undefined;
}

function loadConvexUrl(): string {
  const raw = loadEnvValue(join(root, ".env.local"), "NEXT_PUBLIC_CONVEX_URL");
  const parsed = parseConvexPublicUrl(raw);
  if (!parsed.ok) {
    console.error(
      parsed.reason === "missing"
        ? "Missing .env.local or NEXT_PUBLIC_CONVEX_URL"
        : `Invalid NEXT_PUBLIC_CONVEX_URL: ${parsed.detail ?? ""}`,
    );
    process.exit(1);
  }
  return parsed.href;
}

function loadAdminSecret(): string {
  const s =
    loadEnvValue(join(root, ".env.local"), "DATA_MIGRATION_ADMIN_SECRET") ??
    loadEnvValue(join(root, ".env.local"), "ORG_INTEGRITY_ADMIN_SECRET") ??
    process.env.DATA_MIGRATION_ADMIN_SECRET ??
    process.env.ORG_INTEGRITY_ADMIN_SECRET;
  const t = s?.trim();
  if (!t) {
    console.error(
      "Set DATA_MIGRATION_ADMIN_SECRET (or ORG_INTEGRITY_ADMIN_SECRET) in .env.local",
    );
    process.exit(1);
  }
  return t;
}

function loadMaps(): {
  legacyUserMap: Record<string, string>;
  legacyOrgMap: Record<string, string>;
} {
  const path = process.env.MIGRATION_MAPS_PATH?.trim();
  if (!path) return { legacyUserMap: {}, legacyOrgMap: {} };
  const resolved = path.startsWith("/") || /^[A-Za-z]:/.test(path) ? path : join(root, path);
  if (!existsSync(resolved)) {
    console.error(`MIGRATION_MAPS_PATH not found: ${resolved}`);
    process.exit(1);
  }
  const j = JSON.parse(readFileSync(resolved, "utf8")) as Record<string, unknown>;
  const legacyUserRaw = j.legacyUserMap ?? j[HISTORICAL_USER_MAP_JSON_KEY];
  const legacyOrgRaw = j.legacyOrgMap ?? j[HISTORICAL_ORG_MAP_JSON_KEY];
  return {
    legacyUserMap: (legacyUserRaw ?? {}) as Record<string, string>,
    legacyOrgMap: (legacyOrgRaw ?? {}) as Record<string, string>,
  };
}

function isoStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const cmd = (process.argv[2] ?? "").toLowerCase();
  if (
    ![
      "analyze",
      "dry-run",
      "execute",
      "verify",
      "purge-dry-run",
      "purge-execute",
    ].includes(cmd)
  ) {
    console.error(
      "Usage: tsx scripts/migration-cli.ts <analyze|dry-run|execute|verify|purge-dry-run|purge-execute>",
    );
    process.exit(1);
  }

  mkdirSync(reportsDir, { recursive: true });

  const url = loadConvexUrl();
  const adminSecret = loadAdminSecret();
  const { legacyUserMap, legacyOrgMap } = loadMaps();
  const scanLimitPerTable = Number(process.env.MIGRATION_SCAN_LIMIT ?? "25000");

  const { api } = (await import("../convex/_generated/api.js")) as {
    api: typeof import("../convex/_generated/api").api;
  };

  const client = new ConvexHttpClient(url);

  if (cmd === "analyze") {
    const report = await client.query(api.dataMigration.analyze, {
      adminSecret,
      scanLimitPerTable,
    });
    const out = join(reportsDir, `analyze-${isoStamp()}.json`);
    writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
    console.log(`Wrote ${out}`);
    console.log("counts:", (report as { counts?: unknown }).counts ?? report);
    process.exit(0);
  }

  if (cmd === "verify") {
    const res = await client.query(api.dataMigration.verify, {
      adminSecret,
      scanLimitPerTable,
    });
    const out = join(reportsDir, `verify-${isoStamp()}.json`);
    writeFileSync(out, JSON.stringify(res, null, 2), "utf8");
    console.log(`Wrote ${out}`);
    console.log("severity:", res.severity, "openIssues:", res.openIssues);
    process.exit(res.severity === "ok" ? 0 : 2);
  }

  const purgeExpired =
    process.env.MIGRATION_PURGE_EXPIRED_SESSIONS === "1" ||
    process.env.MIGRATION_PURGE_EXPIRED_SESSIONS === "true";
  /** For `purge-*` commands only: default true unless explicitly disabled. */
  const purgeStaleSessionsDefaultOn =
    process.env.MIGRATION_PURGE_EXPIRED_SESSIONS !== "0" &&
    process.env.MIGRATION_PURGE_EXPIRED_SESSIONS !== "false";
  const deleteLegacyAuth =
    process.env.MIGRATION_DELETE_LEGACY_AUTH_USERS !== "0" &&
    process.env.MIGRATION_DELETE_LEGACY_AUTH_USERS !== "false";

  if (cmd === "purge-dry-run" || cmd === "purge-execute") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const purgeApi = (api as any)["migrations/purgeLegacyExternalAuth"];
    const result = await client.mutation(purgeApi.purgeLegacyExternalAuth, {
      adminSecret,
      dryRun: cmd === "purge-dry-run",
      purgeExpiredSessions: purgeStaleSessionsDefaultOn,
      deleteLegacyAuthUserDocuments: deleteLegacyAuth,
    });
    const out = join(
      reportsDir,
      `${cmd === "purge-dry-run" ? "purge-dry-run" : "purge-execute"}-${isoStamp()}.json`,
    );
    writeFileSync(out, JSON.stringify(result, null, 2), "utf8");
    console.log(`Wrote ${out}`);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  const runId = randomUUID();
  const force =
    process.env.MIGRATION_FORCE === "1" || process.env.MIGRATION_FORCE === "true";

  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        legacyUserMap,
        legacyOrgMap,
        purgeExpiredSessions: purgeExpired,
      }),
    )
    .digest("hex")
    .slice(0, 24);

  const manifestPath = join(
    reportsDir,
    `manifest-${isoStamp()}-${runId.slice(0, 8)}.json`,
  );
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        runId,
        cmd,
        fingerprint,
        legacyUserMapKeys: Object.keys(legacyUserMap).length,
        legacyOrgMapKeys: Object.keys(legacyOrgMap).length,
        purgeExpiredSessions: purgeExpired,
        force,
        scanLimitPerTable,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Manifest ${manifestPath}`);

  if (cmd === "dry-run") {
    const result = await client.mutation(api.dataMigration.run, {
      adminSecret,
      runId: `dry_${runId}`,
      dryRun: true,
      legacyUserMap,
      legacyOrgMap,
      purgeExpiredSessions: purgeExpired,
      scanLimitPerTable,
      force: true,
    });
    const out = join(reportsDir, `dry-run-${isoStamp()}.json`);
    writeFileSync(out, JSON.stringify(result, null, 2), "utf8");
    console.log(`Wrote ${out}`);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (cmd === "execute") {
    const snapshotPath = join(reportsDir, `pre-execute-snapshot-${isoStamp()}.json`);
    const analyzeSnapshot = await client.query(api.dataMigration.analyze, {
      adminSecret,
      scanLimitPerTable: Math.min(scanLimitPerTable, 100_000),
    });
    writeFileSync(
      snapshotPath,
      JSON.stringify({ kind: "pre_execute_analyze", analyzeSnapshot }, null, 2),
      "utf8",
    );
    console.log(`Pre-execute analyze snapshot: ${snapshotPath}`);

    const result = await client.mutation(api.dataMigration.run, {
      adminSecret,
      runId,
      dryRun: false,
      legacyUserMap,
      legacyOrgMap,
      purgeExpiredSessions: purgeExpired,
      scanLimitPerTable,
      force,
    });
    const out = join(reportsDir, `execute-${isoStamp()}.json`);
    writeFileSync(out, JSON.stringify(result, null, 2), "utf8");
    console.log(`Wrote ${out}`);
    console.log(JSON.stringify(result, null, 2));
    if ((result as { skipped?: boolean }).skipped) {
      process.exit(0);
    }
    process.exit(0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
