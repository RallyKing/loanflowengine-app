#!/usr/bin/env node
/**
 * Emit a Convex-ready JWKS data URI from CONVEX_JWT_PUBLIC_KEY_PEM (or generated keys file).
 * Usage: node scripts/generate-convex-jwks-data-uri.mjs
 */
import { importSPKI, exportJWK } from "jose";
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KID = "dlc-workspace-rs256";

function loadPublicPem() {
  const fromEnv = process.env.CONVEX_JWT_PUBLIC_KEY_PEM?.trim();
  if (fromEnv) {
    let pem = fromEnv;
    if (
      (pem.startsWith('"') && pem.endsWith('"')) ||
      (pem.startsWith("'") && pem.endsWith("'"))
    ) {
      pem = pem.slice(1, -1);
    }
    return pem.replace(/\\n/g, "\n");
  }
  const generated = join(root, ".convex-jwt-keys.generated.txt");
  if (!fs.existsSync(generated)) {
    throw new Error("Set CONVEX_JWT_PUBLIC_KEY_PEM or run generate-convex-jwt-keys.mjs first.");
  }
  const text = fs.readFileSync(generated, "utf8");
  const m = text.match(/PUBLIC:\n([\s\S]*)$/);
  if (!m) throw new Error("Could not parse public key from generated file.");
  return m[1].trim();
}

const pem = loadPublicPem();
const key = await importSPKI(pem, "RS256");
const jwk = await exportJWK(key);
const jwks = { keys: [{ ...jwk, alg: "RS256", use: "sig", kid: KID }] };
const b64 = Buffer.from(JSON.stringify(jwks), "utf8").toString("base64");
const dataUri = `data:application/json;base64,${b64}`;

console.log("Set on Convex (Settings → Environment Variables):");
console.log(`CONVEX_JWT_JWKS_URL=${dataUri}`);
console.log("\nOr run:");
console.log(
  `npx convex env set CONVEX_JWT_JWKS_URL "${dataUri.slice(0, 60)}..." --env-file .env.convex.prod`,
);
