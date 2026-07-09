/**
 * Phase 13.3 — Client → Project → Loan File hierarchy helpers (pure + types).
 */

import type { LinkedClientSummary } from "./pipelineClientRelationships";
import { canonicalizeHierarchyKey } from "./pipelineHierarchyNormalize";

export type HierarchyProjectStatus =
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";

export type LegacyVirtualClient = {
  kind: "legacy";
  clientId: null;
  displayName: string;
  normalizedName: string;
};

export type LegacyVirtualProject = {
  kind: "legacy";
  projectId: null;
  clientId: null;
  title: string;
  normalizedTitle: string;
};

export type ResolvedClient =
  | {
      kind: "record";
      clientId: string;
      displayName: string;
      normalizedName: string;
      ownerUserId: string;
    }
  | LegacyVirtualClient;

export type ResolvedProject =
  | {
      kind: "record";
      projectId: string;
      clientId: string;
      title: string;
      normalizedTitle: string;
      ownerUserId: string;
      status: HierarchyProjectStatus;
    }
  | LegacyVirtualProject;

export type ResolvedFileHierarchy = {
  client: ResolvedClient;
  project: ResolvedProject;
  resolution: "foreign_keys" | "legacy_deal_data" | "legacy_file_name";
  /** Phase 14 — all normalized client links on this loan file (primary first). */
  linkedClients: LinkedClientSummary[];
};

export type ResolvedProjectClients = {
  projectId: string;
  /** Authoritative primary from `projects.clientId`. */
  primaryClientId: string;
  linkedClients: LinkedClientSummary[];
};

/** Normalize display keys for dedupe (NFKC + trim + collapse whitespace + lowercase). */
export function normalizeHierarchyName(raw: string): string {
  return canonicalizeHierarchyKey(raw);
}

export function legacyClientProjectFromDealData(
  dealData: unknown,
  fileName?: string,
): { clientName: string; projectName: string; resolution: "legacy_deal_data" | "legacy_file_name" } {
  if (dealData && typeof dealData === "object" && !Array.isArray(dealData)) {
    const d = dealData as Record<string, unknown>;
    const clientName = String(d.clientName ?? "").trim();
    const projectName = String(d.projectName ?? "").trim();
    if (clientName || projectName) {
      return {
        clientName: clientName || "Borrower",
        projectName: projectName || "Project",
        resolution: "legacy_deal_data",
      };
    }
  }
  const fn = String(fileName ?? "").trim();
  const sep = fn.includes(" – ") ? " – " : fn.includes(" - ") ? " - " : null;
  if (sep) {
    const parts = fn.split(sep);
    return {
      clientName: parts[0]!.trim() || "Borrower",
      projectName: parts.slice(1).join(sep).trim() || "Project",
      resolution: "legacy_file_name",
    };
  }
  return {
    clientName: fn || "Borrower",
    projectName: "Project",
    resolution: "legacy_file_name",
  };
}

export function toResolvedClientFromLegacy(
  clientName: string,
): LegacyVirtualClient {
  const displayName = clientName.trim() || "Borrower";
  return {
    kind: "legacy",
    clientId: null,
    displayName,
    normalizedName: normalizeHierarchyName(displayName),
  };
}

export function toResolvedProjectFromLegacy(
  projectName: string,
  clientName: string,
): LegacyVirtualProject {
  const title = projectName.trim() || "Project";
  return {
    kind: "legacy",
    projectId: null,
    clientId: null,
    title,
    normalizedTitle: normalizeHierarchyName(title),
  };
}
