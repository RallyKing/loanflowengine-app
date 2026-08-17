/**
 * Entity (clients) multi-website helpers — normalize, soft-validate, display.
 */
import { normalizeWebsite } from "@/lib/normalize";

export type EntityWebsite = {
  url: string;
  label?: string;
};

/** Ensure a clickable href (adds https:// when protocol is missing). */
export function websiteHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Human-friendly link text — label, else host (+ path when meaningful). */
export function websiteDisplayLabel(entry: EntityWebsite): string {
  const label = entry.label?.trim();
  if (label) return label;
  try {
    const u = new URL(websiteHref(entry.url));
    const host = u.hostname.replace(/^www\./i, "");
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${host}${path}${u.search}` || entry.url;
  } catch {
    return entry.url;
  }
}

/**
 * Soft URL validation — accept with/without https; block empty and
 * clearly invalid hosts. Does not reject common bare domains.
 */
export function validateWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Enter a website URL.";
  if (/\s/.test(trimmed)) return "Remove spaces from the URL.";
  try {
    const u = new URL(websiteHref(trimmed));
    const host = u.hostname.trim();
    if (!host) return "Enter a valid website (e.g. example.com).";
    if (host !== "localhost" && !host.includes(".")) {
      return "Enter a valid website (e.g. example.com).";
    }
    return null;
  } catch {
    return "Enter a valid website (e.g. example.com).";
  }
}

/** Normalize + dedupe by href; drop empties. Safe for undefined (legacy rows). */
export function normalizeEntityWebsites(
  entries: Array<{ url: string; label?: string }> | undefined | null,
): EntityWebsite[] {
  if (!entries?.length) return [];
  const out: EntityWebsite[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const url = normalizeWebsite(entry.url);
    if (!url) continue;
    const key = websiteHref(url).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = entry.label?.trim() || undefined;
    out.push(label ? { url, label } : { url });
  }
  return out;
}

/** Read-time default for older docs without `websites`. */
export function resolveEntityWebsites(client: {
  websites?: EntityWebsite[] | null;
}): EntityWebsite[] {
  return Array.isArray(client.websites) ? client.websites : [];
}

/** Union two lists by normalized href (prefer first list's label on collision). */
export function mergeEntityWebsites(
  surviving: EntityWebsite[] | undefined | null,
  merged: EntityWebsite[] | undefined | null,
): EntityWebsite[] {
  return normalizeEntityWebsites([
    ...(surviving ?? []),
    ...(merged ?? []),
  ]);
}

export function entityWebsitesSearchBlob(
  websites: EntityWebsite[] | undefined | null,
): string {
  return resolveEntityWebsites({ websites })
    .map((w) => [w.url, w.label ?? ""].join(" "))
    .join(" ");
}
