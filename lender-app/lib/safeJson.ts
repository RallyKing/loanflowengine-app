/**
 * Defensive JSON.parse for localStorage, query params, and other untrusted text.
 */

export function parseJsonUnknown(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function parseJsonString<T>(raw: string, fallback: T): T {
  const v = parseJsonUnknown(raw);
  return v === undefined ? fallback : (v as T);
}
