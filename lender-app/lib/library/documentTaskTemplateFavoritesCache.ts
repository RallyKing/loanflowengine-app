/**
 * Optimistic localStorage cache for Apply Template individual-task favorites.
 * Server (Convex `documentTaskTemplateFavorites`) is source of truth.
 */

const STORAGE_PREFIX = "dlc:documentTaskTemplateFavorites:v1:";

function storageKey(organizationId: string, memberUserKey: string): string {
  return `${STORAGE_PREFIX}${organizationId}:${memberUserKey}`;
}

export function readCachedTemplateFavoriteIds(
  organizationId: string,
  memberUserKey: string,
): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(
      storageKey(organizationId, memberUserKey),
    );
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function writeCachedTemplateFavoriteIds(
  organizationId: string,
  memberUserKey: string,
  templateIds: Iterable<string>,
): void {
  if (typeof window === "undefined") return;
  try {
    const unique = [...new Set([...templateIds].map(String))];
    window.localStorage.setItem(
      storageKey(organizationId, memberUserKey),
      JSON.stringify(unique),
    );
  } catch {
    /* quota / private mode — ignore */
  }
}
