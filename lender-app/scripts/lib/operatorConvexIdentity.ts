/**
 * Trusted operator identity for CLI scripts (from local env — not browser-spoofable).
 */
import {
  loadAdminSecret,
  lenderAppRoot,
  MIGRATION_ENV_FILES,
} from "./migrationOperatorEnv";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvValue(key: string): string | undefined {
  for (const p of MIGRATION_ENV_FILES) {
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
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
  }
  return process.env[key]?.trim();
}

export function loadOperatorOrgScope(): {
  organizationId: string;
  memberUserKey: string;
} {
  const organizationId = loadEnvValue("APP_AUTH_ORGANIZATION_ID");
  const memberUserKey = loadEnvValue("APP_AUTH_USER_KEY");
  if (!organizationId || !memberUserKey) {
    throw new Error(
      "APP_AUTH_ORGANIZATION_ID and APP_AUTH_USER_KEY must be set in .env.local for operator scripts.",
    );
  }
  return { organizationId, memberUserKey };
}

export function loadOperatorSecret(): string {
  const secret = loadAdminSecret();
  if (!secret) {
    throw new Error(
      "DATA_MIGRATION_ADMIN_SECRET required for operator-gated Convex mutations.",
    );
  }
  return secret;
}

export { lenderAppRoot };
