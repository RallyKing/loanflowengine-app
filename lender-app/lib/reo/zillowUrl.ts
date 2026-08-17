/**
 * Per-REO listing / Zillow URL — paste, validate, persist, reopen.
 * Accepts http(s) and protocol-less hosts (zillow.com/…, listing sites).
 */
import { websiteHref } from "@/lib/contacts/entityWebsites";

const MAX_REO_LISTING_URL_LENGTH = 2048;

/** Clickable href, or "" when empty / invalid. */
export function reoListingHref(raw: string | undefined | null): string {
  return normalizeReoListingUrl(raw) ?? "";
}

/**
 * Persist form: absolute http(s) URL, or undefined to clear / omit.
 * Does not invent values for junk input (javascript:, spaces, no host).
 */
export function normalizeReoListingUrl(
  raw: unknown,
): string | undefined {
  if (raw == null) return undefined;
  const trimmed = String(raw)
    .trim()
    .replace(/^[<"']+|[>"']+$/g, "");
  if (!trimmed) return undefined;
  if (/\s/.test(trimmed)) return undefined;
  if (trimmed.length > MAX_REO_LISTING_URL_LENGTH) return undefined;
  try {
    const href = websiteHref(trimmed);
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    const host = u.hostname.trim();
    if (!host) return undefined;
    if (host !== "localhost" && !host.includes(".")) return undefined;
    return href;
  } catch {
    return undefined;
  }
}

/** Empty is valid (clear). Non-empty must be a reasonable http(s) URL. */
export function reoListingUrlError(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) return "Remove spaces from the URL.";
  if (!normalizeReoListingUrl(trimmed)) {
    return "Enter a valid http(s) listing URL (Zillow or similar).";
  }
  return null;
}
