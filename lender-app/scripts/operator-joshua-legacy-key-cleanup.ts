/**
 * Repoint legacy `user_*` / vendor-shaped keys to the primary platform `authUsers` id.
 *
 *   npx tsx scripts/operator-joshua-legacy-key-cleanup.ts
 *   npx tsx scripts/operator-joshua-legacy-key-cleanup.ts --dry-run
 *   npx tsx scripts/operator-joshua-legacy-key-cleanup.ts --extra user_xxxxx
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import {
  loadAdminSecret,
  printMissingAdminSecretDiagnostics,
} from "./lib/migrationOperatorEnv";

function convexUrlForOperator(): string | undefined {
  const prodPath = join(process.cwd(), ".env.convex.prod");
  if (existsSync(prodPath)) {
    for (const line of readFileSync(prodPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      if (t.slice(0, i).trim() !== "NEXT_PUBLIC_CONVEX_URL") continue;
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    }
  }
  return undefined;
}

function parseExtraKeys(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--extra" && argv[i + 1]) {
      out.push(argv[i + 1]!);
      i++;
    }
  }
  return out;
}

async function main() {
  const adminSecret = loadAdminSecret();
  if (!adminSecret) {
    printMissingAdminSecretDiagnostics();
    process.exit(1);
  }
  const url = convexUrlForOperator();
  if (!url) {
    console.error("Missing NEXT_PUBLIC_CONVEX_URL in .env.convex.prod");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const extras = parseExtraKeys(process.argv);
  const client = new ConvexHttpClient(url);
  const r = await client.mutation(
    // @ts-expect-error slash-path migration modules are runtime-valid
    api["migrations/joshuaLegacyUserKeyCleanup"].applyJoshuaLegacyUserKeyCleanup,
    {
      adminSecret,
      dryRun,
      ...(extras.length ? { additionalLegacyUserKeys: extras } : {}),
    },
  );
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
