/**
 * Shared loader for operator scripts (DATA_MIGRATION_ADMIN_SECRET, Convex URL).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export const lenderAppRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const MIGRATION_ENV_FILES = [
  join(lenderAppRoot, ".env.local"),
  join(lenderAppRoot, ".env.convex.prod"),
  join(lenderAppRoot, ".env"),
] as const;

function loadEnvValue(envPath: string, key: string): string | undefined {
  if (!existsSync(envPath)) return undefined;
  const text = readFileSync(envPath, "utf8");
  const re = new RegExp(`^(?:export\\s+)?${key}\\s*=\\s*(.*)$`);
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(re);
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

function loadSecretFilePath(): string | undefined {
  for (const p of MIGRATION_ENV_FILES) {
    const v = loadEnvValue(p, "DATA_MIGRATION_ADMIN_SECRET_FILE")?.trim();
    if (v) return v;
  }
  return process.env.DATA_MIGRATION_ADMIN_SECRET_FILE?.trim();
}

function loadAdminSecretFromFile(): string | undefined {
  const rel = loadSecretFilePath();
  if (!rel) return undefined;
  const abs = isAbsolute(rel) ? rel : join(lenderAppRoot, rel);
  if (!existsSync(abs)) return undefined;
  const line = readFileSync(abs, "utf8").split(/\r?\n/)[0]?.trim();
  return line || undefined;
}

export function envLocalHasAppAuthButNoMigrationSecret(): boolean {
  const p = join(lenderAppRoot, ".env.local");
  if (!existsSync(p)) return false;
  const raw = readFileSync(p, "utf8");
  const hasAppAuth = /^\s*(?:export\s+)?APP_AUTH_PASSWORD\s*=/m.test(raw);
  const hasMigration =
    /^\s*(?:export\s+)?DATA_MIGRATION_ADMIN_SECRET\s*=/m.test(raw) ||
    /^\s*(?:export\s+)?ORG_INTEGRITY_ADMIN_SECRET\s*=/m.test(raw) ||
    /^\s*(?:export\s+)?DATA_MIGRATION_ADMIN_SECRET_FILE\s*=/m.test(raw);
  return hasAppAuth && !hasMigration;
}

export function loadAdminSecret(): string {
  const fromFile = loadAdminSecretFromFile();
  if (fromFile) return fromFile;
  for (const p of MIGRATION_ENV_FILES) {
    const s =
      loadEnvValue(p, "DATA_MIGRATION_ADMIN_SECRET")?.trim() ||
      loadEnvValue(p, "ORG_INTEGRITY_ADMIN_SECRET")?.trim();
    if (s) return s;
  }
  return (
    process.env.DATA_MIGRATION_ADMIN_SECRET?.trim() ||
    process.env.ORG_INTEGRITY_ADMIN_SECRET?.trim() ||
    ""
  );
}

export function loadConvexUrlRaw(): string | undefined {
  const fromProcess = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (fromProcess) return fromProcess;
  for (const p of MIGRATION_ENV_FILES) {
    const v = loadEnvValue(p, "NEXT_PUBLIC_CONVEX_URL")?.trim();
    if (v) return v;
  }
  return undefined;
}

/**
 * Prefer `.env.convex.prod` for `NEXT_PUBLIC_CONVEX_URL` so operator scripts hit
 * production even when `.env.local` points at a local Convex dev replica.
 */
export function loadConvexUrlPreferProd(): string | undefined {
  const prodPath = join(lenderAppRoot, ".env.convex.prod");
  if (existsSync(prodPath)) {
    const v = loadEnvValue(prodPath, "NEXT_PUBLIC_CONVEX_URL")?.trim();
    if (v) return v;
  }
  return loadConvexUrlRaw();
}

export function printMissingAdminSecretDiagnostics(): void {
  console.error(
    "No DATA_MIGRATION_ADMIN_SECRET or ORG_INTEGRITY_ADMIN_SECRET found (must match Convex dashboard env).",
  );
  console.error("Checked files (existence only):");
  for (const p of MIGRATION_ENV_FILES) {
    console.error(`  ${existsSync(p) ? "ok " : "—  "} ${p}`);
  }
  console.error(
    "Also checked process.env and DATA_MIGRATION_ADMIN_SECRET_FILE (first line of that file).",
  );
  console.error(
    "PowerShell: $env:DATA_MIGRATION_ADMIN_SECRET='…' ; npm run admin:reset-password",
  );
  if (envLocalHasAppAuthButNoMigrationSecret()) {
    console.error(
      "Hint: .env.local defines APP_AUTH_* (Next dev cookie login) but not DATA_MIGRATION_ADMIN_SECRET.",
    );
    console.error(
      "If Convex does not have this variable yet, create DATA_MIGRATION_ADMIN_SECRET in Convex → Settings → Environment Variables, deploy, then mirror it here.",
    );
    console.error(
      "or set DATA_MIGRATION_ADMIN_SECRET_FILE to a gitignored file whose first line is that secret.",
    );
  }
}
