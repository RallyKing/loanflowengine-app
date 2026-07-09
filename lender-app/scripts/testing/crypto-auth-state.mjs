/**
 * Encrypt/decrypt Playwright storageState JSON for CI secrets.
 *
 * Generate key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
 *
 * Encrypt: `node scripts/testing/crypto-auth-state.mjs encrypt tests/fixtures/local-storage.json tests/auth/super-admin.enc`
 * Decrypt: `node scripts/testing/crypto-auth-state.mjs decrypt tests/auth/super-admin.enc /tmp/out.json`
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const keyHex = process.env.TEST_SESSION_ENCRYPTION_KEY?.trim();
if (!keyHex || keyHex.length < 64) {
  console.error("Set TEST_SESSION_ENCRYPTION_KEY (64 hex chars = 32 bytes).");
  process.exit(1);
}
const key = Buffer.from(keyHex, "hex");

const [op, inputPath, outputPath] = process.argv.slice(2);
if (!op || !inputPath || !outputPath) {
  console.error(
    "Usage: crypto-auth-state.mjs encrypt <in.json> <out.enc>\n       crypto-auth-state.mjs decrypt <in.enc> <out.json>",
  );
  process.exit(1);
}

if (op === "encrypt") {
  const plain = readFileSync(inputPath);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  writeFileSync(outputPath, Buffer.concat([iv, tag, enc]));
  console.log("Wrote", outputPath);
} else if (op === "decrypt") {
  const raw = readFileSync(inputPath);
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const body = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(body), decipher.final()]);
  writeFileSync(outputPath, dec);
  console.log("Wrote", outputPath);
} else {
  console.error("Unknown op", op);
  process.exit(1);
}
