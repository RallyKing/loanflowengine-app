/**
 * Operator script: call `migrations/mergeAuthUsersByEmail:mergeAuthUsersByEmail`.
 *
 * Usage:
 *   npx tsx scripts/run-merge-auth-users-email.ts --email user@example.com --dry-run
 *   DATA_MIGRATION_ADMIN_SECRET=... npx tsx scripts/run-merge-auth-users-email.ts --email user@example.com --execute
 *
 * Loads NEXT_PUBLIC_CONVEX_URL from `.env.local` / `.env` when present.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

function loadEnvFile(name: string) {
  const p = join(process.cwd(), name);
  if (!existsSync(p)) return;
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
    if (process.env[k] === undefined || process.env[k] === "") {
      process.env[k] = v;
    }
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let email = "";
  let dryRun = true;
  let canonical: string | undefined;
  let matchUsername = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email" && argv[i + 1]) {
      email = argv[++i]!;
      continue;
    }
    if (a === "--canonical" && argv[i + 1]) {
      canonical = argv[++i];
      continue;
    }
    if (a === "--execute") {
      dryRun = false;
      continue;
    }
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (a === "--no-username-match") {
      matchUsername = false;
      continue;
    }
  }
  return { email, dryRun, canonical, matchUsername };
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const { email, dryRun, canonical, matchUsername } = parseArgs();
  if (!email.trim()) {
    throw new Error("Pass --email you@domain.com");
  }
  const adminSecret = process.env.DATA_MIGRATION_ADMIN_SECRET?.trim();
  if (!adminSecret) {
    throw new Error(
      "Set DATA_MIGRATION_ADMIN_SECRET (or ORG_INTEGRITY_ADMIN_SECRET in migration gate).",
    );
  }
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL.");
  }

  const client = new ConvexHttpClient(url);
  // api typings use slash-path modules; Convex client accepts the function reference at runtime.
  const result = await client.mutation(
    // @ts-expect-error migrations live under "migrations/*" paths
    api["migrations/mergeAuthUsersByEmail"].mergeAuthUsersByEmail,
    {
      adminSecret,
      email: email.trim(),
      matchUsernameAsEmail: matchUsername,
      ...(canonical
        ? {
            canonicalAuthUserId: canonical as import("../convex/_generated/dataModel").Id<"authUsers">,
          }
        : {}),
      dryRun,
    },
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
