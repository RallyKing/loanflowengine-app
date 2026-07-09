/**
 * Run referentialIntegrity against production Convex.
 *
 * **Preferred:** migration operator secret (same as other admin scripts):
 *   DATA_MIGRATION_ADMIN_SECRET or ORG_INTEGRITY_ADMIN_SECRET in .env.local / .env.convex.prod
 *   Uses `referentialIntegrity.operatorScan` / `operatorRepairRepairable`.
 *
 * **Alternate:** global-admin authUsers id:
 *   APP_AUTH_USER_KEY — uses `scan` / `repairRepairable`.
 *
 * Usage:
 *   npx tsx scripts/run-referential-integrity.ts [--prod] [--repair]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import {
  loadAdminSecret,
  loadConvexUrlPreferProd,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvPath(p: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (v) out[k] = v;
  }
  return out;
}

function pickUrl(
  prod: Record<string, string>,
  local: Record<string, string>,
  useProd: boolean,
): string {
  if (useProd && prod.NEXT_PUBLIC_CONVEX_URL)
    return prod.NEXT_PUBLIC_CONVEX_URL;
  if (local.NEXT_PUBLIC_CONVEX_URL) return local.NEXT_PUBLIC_CONVEX_URL;
  if (prod.NEXT_PUBLIC_CONVEX_URL) return prod.NEXT_PUBLIC_CONVEX_URL;
  return process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ?? "";
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const useProdFile = args.has("--prod") || !args.has("--local");
  const doRepair = args.has("--repair");

  const prod = loadEnvPath(join(root, ".env.convex.prod"));
  const local = loadEnvPath(join(root, ".env.local"));
  const urlFromFiles = pickUrl(prod, local, useProdFile);
  const url = urlFromFiles || loadConvexUrlPreferProd() || "";

  const memberUserKey =
    prod.APP_AUTH_USER_KEY ||
    local.APP_AUTH_USER_KEY ||
    process.env.APP_AUTH_USER_KEY?.trim() ||
    "";

  const adminSecret = loadAdminSecret();

  if (!url || !url.includes("convex")) {
    console.error(
      "Missing NEXT_PUBLIC_CONVEX_URL (set in .env.convex.prod or .env.local).",
    );
    process.exit(1);
  }

  const { api } = await import("../convex/_generated/api.js");
  const client = new ConvexHttpClient(url);

  let scan: unknown;
  let repair: unknown = null;

  try {
    if (adminSecret) {
      scan = await client.query(api.referentialIntegrity.operatorScan, {
        adminSecret,
      });
    } else if (memberUserKey) {
      scan = await client.query(api.referentialIntegrity.scan, {
        memberUserKey,
      });
    } else {
      printMissingAdminSecretDiagnostics();
      console.error(
        "Also need APP_AUTH_USER_KEY (authUsers id) for global-admin scan, or set DATA_MIGRATION_ADMIN_SECRET.",
      );
      process.exit(1);
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        step: "scan",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    process.exit(2);
  }

  const repairableCount = (scan as { repairable?: unknown[] }).repairable
    ?.length;

  if (doRepair && repairableCount && repairableCount > 0) {
    try {
      if (adminSecret) {
        repair = await client.mutation(
          api.referentialIntegrity.operatorRepairRepairable,
          {
            adminSecret,
            dryRun: false,
          },
        );
      } else {
        repair = await client.mutation(api.referentialIntegrity.repairRepairable, {
          memberUserKey,
          dryRun: false,
        });
      }
    } catch (e) {
      repair = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        convexUrl: url,
        authMode: adminSecret ? "operatorSecret" : "globalAdminUserKey",
        scan,
        repair:
          repair ??
          (doRepair && (!repairableCount || repairableCount === 0)
            ? { skipped: "no_repairable_rows" }
            : doRepair
              ? null
              : { skipped: "pass --repair to mutate" }),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
