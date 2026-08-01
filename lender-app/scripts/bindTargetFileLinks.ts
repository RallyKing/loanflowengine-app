/**
 * Force-bind a known ghost lender-delivery token into clientPortalLinks for a file.
 *
 * Env (lender-app/.env.local):
 *   NEXT_PUBLIC_CONVEX_URL
 *   DATA_MIGRATION_ADMIN_SECRET (or ORG_INTEGRITY_ADMIN_SECRET)
 *
 * Usage:
 *   npm run bind:ghost-link -- <pipelineFileId> <plainToken>
 *   npm run bind:ghost-link -- diagnose <plainToken> [pipelineNameHint]
 */
import { ConvexHttpClient } from "convex/browser";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConvexPublicUrl } from "../lib/convexPublicUrl";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

async function main() {
  const mode = process.argv[2];
  const client = new ConvexHttpClient(loadConvexUrl());
  const adminSecret = loadAdminSecret();

  const { api } = (await import("../convex/_generated/api.js")) as {
    api: typeof import("../convex/_generated/api").api;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const migrationsApi = (api as any)["migrations/auditAndMigrateLegacyLinks"];

  if (mode === "diagnose") {
    const token = process.argv[3];
    const pipelineNameHint = process.argv[4];
    if (!token) {
      console.error(
        "Usage: tsx scripts/bindTargetFileLinks.ts diagnose <token> [pipelineNameHint]",
      );
      process.exit(1);
    }
    const result = await client.mutation(migrationsApi.diagnosePortalToken, {
      adminSecret,
      token,
      pipelineNameHint,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  const pipelineFileId = mode;
  const token = process.argv[3];
  if (!pipelineFileId || !token) {
    console.error(
      "Usage: tsx scripts/bindTargetFileLinks.ts <pipelineFileId> <plainToken>",
    );
    console.error(
      "       tsx scripts/bindTargetFileLinks.ts diagnose <plainToken> [pipelineNameHint]",
    );
    process.exit(1);
  }

  const result = await client.mutation(migrationsApi.bindGhostLenderLink, {
    adminSecret,
    pipelineFileId,
    token,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
