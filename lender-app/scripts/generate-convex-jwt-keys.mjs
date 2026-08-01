#!/usr/bin/env node
/**
 * Generate RS256 key pair for Convex native JWT bridge.
 * Paste output into .env.local (Next.js) — never commit private key.
 */
import { generateKeyPair, exportPKCS8, exportSPKI } from "jose";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
const privatePem = await exportPKCS8(privateKey);
const publicPem = await exportSPKI(publicKey);

const esc = (pem) => pem.replace(/\n/g, "\\n");

console.log("Add to .env.local:\n");
console.log(`CONVEX_JWT_PRIVATE_KEY_PEM="${esc(privatePem)}"`);
console.log(`CONVEX_JWT_PUBLIC_KEY_PEM="${esc(publicPem)}"`);
console.log(`CONVEX_JWT_ISSUER=http://localhost:3000`);
console.log(`CONVEX_JWT_APPLICATION_ID=dlc-workspace`);
console.log(`CONVEX_JWT_JWKS_URL=http://localhost:3000/.well-known/jwks.json`);

writeFileSync(
  join(root, ".convex-jwt-keys.generated.txt"),
  `# Generated ${new Date().toISOString()} — gitignored pattern; delete after copying to .env.local\n\nPRIVATE:\n${privatePem}\n\nPUBLIC:\n${publicPem}\n`,
  "utf8",
);
console.log("\nAlso wrote .convex-jwt-keys.generated.txt (local only).");
