/**
 * Human-parsable external credential formats (HTTP + admin UIs).
 */

export const API_KEY_PREFIX = "idc_live_";
export const ACCESS_TOKEN_PREFIX = "int_at_";
export const OAUTH_CLIENT_ID_PREFIX = "int_oauth_";

const HEX16 = "[a-f0-9]{16}";
const HEX64 = "[a-f0-9]{64}";

const API_KEY_RE = new RegExp(
  `^${API_KEY_PREFIX}(${HEX16})_(${HEX64})$`,
  "i",
);
const ACCESS_TOKEN_RE = new RegExp(
  `^${ACCESS_TOKEN_PREFIX}(${HEX16})_(${HEX64})$`,
  "i",
);
const OAUTH_CLIENT_ID_RE = new RegExp(
  `^${OAUTH_CLIENT_ID_PREFIX}(${HEX16})$`,
  "i",
);

export function parseApiKeyBearer(raw: string): {
  publicId: string;
  secretHex: string;
} | null {
  const t = raw.trim();
  const m = t.match(API_KEY_RE);
  if (!m) return null;
  return { publicId: m[1]!.toLowerCase(), secretHex: m[2]!.toLowerCase() };
}

export function parseAccessTokenBearer(raw: string): {
  publicId: string;
  secretHex: string;
} | null {
  const t = raw.trim();
  const m = t.match(ACCESS_TOKEN_RE);
  if (!m) return null;
  return { publicId: m[1]!.toLowerCase(), secretHex: m[2]!.toLowerCase() };
}

export function parseOAuthClientId(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(OAUTH_CLIENT_ID_RE);
  if (!m) return null;
  return m[1]!.toLowerCase();
}

export function formatApiKey(publicId: string, secretHex: string): string {
  return `${API_KEY_PREFIX}${publicId}_${secretHex}`;
}

export function formatAccessToken(publicId: string, secretHex: string): string {
  return `${ACCESS_TOKEN_PREFIX}${publicId}_${secretHex}`;
}

export function formatOAuthClientId(publicId: string): string {
  return `${OAUTH_CLIENT_ID_PREFIX}${publicId}`;
}
