/**
 * Hub tree keys — shared between UI (`hubHierarchyTree`) and Convex legacy cleanup.
 */
import type { ResolvedFileHierarchy } from "@/lib/pipelineHierarchy";
import { normalizeHierarchyName } from "@/lib/pipelineHierarchy";

/** Convex document ids are long alphanumeric strings without `:` or spaces. */
export function isLikelyConvexTableId(value: string): boolean {
  const id = value.trim();
  if (!id || id.includes(":") || id.includes(" ") || id.startsWith("legacy-")) {
    return false;
  }
  return /^[a-z0-9_]+$/i.test(id) && id.length >= 20;
}

/** Prefixed synthetic hub key (`legacy-client:…`, `legacy-project:…`). */
export function isLegacyHubKey(hubKey: string): boolean {
  return hubKey.startsWith("legacy-");
}

/** Synthetic hub row — includes unprefixed display names like `rtest`. */
export function isSyntheticHubClientKey(hubClientKey: string): boolean {
  const key = hubClientKey.trim();
  if (key.startsWith("legacy-client:")) return true;
  if (key.includes(":")) return true;
  return !isLikelyConvexTableId(key);
}

export function isSyntheticHubProjectKey(hubProjectKey: string): boolean {
  const key = hubProjectKey.trim();
  if (key.startsWith("legacy-project:")) return true;
  if (key.includes(":")) return true;
  return !isLikelyConvexTableId(key);
}

export function normalizeHubClientKey(hubClientKey: string): {
  isSynthetic: boolean;
  canonicalHubKey: string;
  displayName: string;
} {
  const trimmed = hubClientKey.trim();
  if (trimmed.startsWith("legacy-client:")) {
    const displayName = trimmed.slice("legacy-client:".length).trim() || "borrower";
    return {
      isSynthetic: true,
      canonicalHubKey: hubClientKeyFromDisplayName(displayName),
      displayName,
    };
  }
  if (isLikelyConvexTableId(trimmed)) {
    return { isSynthetic: false, canonicalHubKey: trimmed, displayName: "" };
  }
  const displayName = trimmed || "borrower";
  return {
    isSynthetic: true,
    canonicalHubKey: hubClientKeyFromDisplayName(displayName),
    displayName,
  };
}

export function normalizeHubProjectKey(hubProjectKey: string): {
  isSynthetic: boolean;
  canonicalHubKey: string;
  projectTitle: string;
  hubClientKey: string;
} {
  const trimmed = hubProjectKey.trim();
  if (trimmed.startsWith("legacy-project:")) {
    const rest = trimmed.slice("legacy-project:".length);
    const lastColon = rest.lastIndexOf(":");
    const hubClientKey =
      lastColon > 0 ? rest.slice(0, lastColon) : hubClientKeyFromDisplayName("borrower");
    const projectTitle =
      lastColon > 0 ? rest.slice(lastColon + 1).trim() || "project" : "project";
    const clientNorm = normalizeHubClientKey(hubClientKey);
    return {
      isSynthetic: true,
      canonicalHubKey: hubProjectKeyFromParts(
        clientNorm.canonicalHubKey,
        projectTitle,
      ),
      projectTitle,
      hubClientKey: clientNorm.canonicalHubKey,
    };
  }
  if (isLikelyConvexTableId(trimmed)) {
    return {
      isSynthetic: false,
      canonicalHubKey: trimmed,
      projectTitle: "",
      hubClientKey: "",
    };
  }
  const projectTitle = trimmed || "project";
  const hubClientKey = hubClientKeyFromDisplayName("borrower");
  return {
    isSynthetic: true,
    canonicalHubKey: hubProjectKeyFromParts(hubClientKey, projectTitle),
    projectTitle,
    hubClientKey,
  };
}

export function legacyDisplayNameMatches(
  hubClientKey: string,
  clientDisplayName: string,
): boolean {
  const norm = normalizeHubClientKey(hubClientKey);
  if (!norm.isSynthetic) return false;
  return (
    normalizeHierarchyName(norm.displayName) ===
    normalizeHierarchyName(clientDisplayName)
  );
}

export function hubClientKeyFromDisplayName(displayName: string): string {
  return `legacy-client:${displayName.trim() || "borrower"}`;
}

export function hubProjectKeyFromParts(
  hubClientKey: string,
  projectTitle: string,
): string {
  return `legacy-project:${hubClientKey}:${projectTitle.trim() || "project"}`;
}

export function hubClientKeyFromRowFields(row: {
  clientId?: string | null;
  clientDisplayName?: string | null;
}): string {
  return row.clientId
    ? String(row.clientId)
    : hubClientKeyFromDisplayName(row.clientDisplayName ?? "");
}

export function hubProjectKeyFromRowFields(row: {
  clientId?: string | null;
  clientDisplayName?: string | null;
  projectId?: string | null;
  projectDisplayTitle?: string | null;
}): string {
  return row.projectId
    ? String(row.projectId)
    : hubProjectKeyFromParts(
        hubClientKeyFromRowFields(row),
        row.projectDisplayTitle ?? "",
      );
}

export function hubClientKeyFromHierarchy(h: ResolvedFileHierarchy): string {
  if (h.client.kind === "record") return h.client.clientId;
  return hubClientKeyFromDisplayName(h.client.displayName);
}

export function hubProjectKeyFromHierarchy(h: ResolvedFileHierarchy): string {
  if (h.project.kind === "record") return h.project.projectId;
  return hubProjectKeyFromParts(
    hubClientKeyFromHierarchy(h),
    h.project.title,
  );
}
