/**
 * AES-256-GCM for optional portal free-text fields (e.g. request description).
 * Set `CLIENT_PORTAL_FIELD_ENCRYPTION_KEY` in Convex env to a base64-encoded
 * 32-byte key. When unset, values are stored as plaintext (legacy behavior).
 */

const PREFIX = "$$enc:v1$";

function encryptionKeyB64(): string | undefined {
  return process.env.CLIENT_PORTAL_FIELD_ENCRYPTION_KEY?.trim();
}

export function isPortalFieldEncryptionConfigured(): boolean {
  return Boolean(encryptionKeyB64());
}

async function importAesKey(): Promise<CryptoKey | null> {
  const b64 = encryptionKeyB64();
  if (!b64) return null;
  const raw = Buffer.from(b64, "base64");
  if (raw.length !== 32) {
    console.error(
      "CLIENT_PORTAL_FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (base64).",
    );
    return null;
  }
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(raw),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealOptionalPortalPlaintext(
  plain: string | undefined,
): Promise<string | undefined> {
  if (plain === undefined || plain === "") return plain;
  const key = await importAesKey();
  if (!key) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plain),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return PREFIX + Buffer.from(combined).toString("base64");
}

export async function openOptionalPortalCiphertext(
  stored: string | undefined,
): Promise<string | undefined> {
  if (stored === undefined || stored === "") return stored;
  if (!stored.startsWith(PREFIX)) return stored;
  const key = await importAesKey();
  if (!key) return "[encrypted]";
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const ct = raw.subarray(12);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      new Uint8Array(ct),
    );
    return new TextDecoder().decode(pt);
  } catch {
    return "[encrypted]";
  }
}
