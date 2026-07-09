/**
 * Loads `.env.testing` then calls `testingSeed:seedE2EWorkspace` via Convex HTTP client.
 *
 * Set `TESTING_SEED_SECRET` in the Convex dashboard to match `.env.testing`.
 * Optional: `E2E_PASS_CLIENT_PORTAL` (6–128 chars per password policy) seeds portal identity + grant.
 *
 * Prints organization ids — copy into `.env.testing` as `E2E_ORG_PRIMARY_ID` and
 * `E2E_ORG_SECONDARY_ID` before running multi-persona Playwright tests.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { validatePlaintextPasswordPolicy } from "../lib/auth/passwordPolicy";

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

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env.testing");

  const secret = process.env.TESTING_SEED_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "Missing TESTING_SEED_SECRET (Convex dashboard + .env.testing).",
    );
  }

  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL.");
  }

  const portalClientPassword = process.env.E2E_PASS_CLIENT_PORTAL?.trim();
  const client = new ConvexHttpClient(url);
  const out = await client.mutation(api.testingSeed.seedE2EWorkspace, {
    secret,
    portalClientPassword:
      portalClientPassword &&
      validatePlaintextPasswordPolicy(portalClientPassword) === null
        ? portalClientPassword
        : undefined,
  });

  console.log(JSON.stringify(out, null, 2));
  console.log("\n# Add or refresh in .env.testing:");
  console.log(`E2E_ORG_PRIMARY_ID=${out.primaryOrganizationId}`);
  console.log(`E2E_ORG_SECONDARY_ID=${out.secondaryOrganizationId}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
